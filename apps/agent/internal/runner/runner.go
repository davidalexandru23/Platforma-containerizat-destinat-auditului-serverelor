package runner

import (
	"crypto/tls"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"bittrail-agent/internal/api"
	"bittrail-agent/internal/collector"
	"bittrail-agent/internal/config"
)

func Run(configPath string) error {
	cfg, err := config.Load(configPath)
	if err != nil {
		return fmt.Errorf("eroare la incarcarea configuratiei: %w", err)
	}

	// --- Configurare PKI ---
	var tlsConfig *tls.Config
	if cfg.CertFile != "" && cfg.KeyFile != "" {
		fmt.Printf("Loading certificates from:\n  Cert: %s\n  Key:  %s\n", cfg.CertFile, cfg.KeyFile)
		cert, err := tls.LoadX509KeyPair(cfg.CertFile, cfg.KeyFile)
		if err != nil {
			log.Printf("WARNING: Failed to load keypair: %v. Running without mTLS.", err)
		} else {
			// Configurare TLS custom
			tlsConfig = &tls.Config{
				Certificates:       []tls.Certificate{cert},
				InsecureSkipVerify: true, // Dev: cert server self-signed
			}
			log.Println("mTLS enabled successfully.")
		}
	}

	client := api.NewClient(cfg.ServerURL, cfg.ServerID, cfg.AgentToken, tlsConfig)

	// Initializare colectori
	metricsCollector := collector.NewMetricsCollector()
	inventoryCollector := collector.NewInventoryCollector()
	auditRunner := collector.NewAuditRunner(client, cfg.KeyFile, cfg.BackendKeyFile)

	// --- Initializare SNMP Sender (optional) ---
	var snmpSender *collector.SNMPSender
	if cfg.SNMPEnabled && cfg.SNMPTarget != "" {
		snmpSender = collector.NewSNMPSender(
			cfg.SNMPTarget,
			cfg.SNMPPort,
			cfg.SNMPCommunity,
			cfg.ServerID,
		)
		log.Printf("SNMP Trap activat: %s:%d (community: %s, interval: %ds)",
			cfg.SNMPTarget, cfg.SNMPPort, cfg.SNMPCommunity, cfg.SNMPInterval)
	} else {
		log.Println("SNMP Trap dezactivat. Metrici doar prin HTTP POST.")
	}

	// Canal oprire (graceful shutdown)
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	// Tickere job-uri periodice
	metricsTicker := time.NewTicker(time.Duration(cfg.MetricsInterval) * time.Second)
	inventoryTicker := time.NewTicker(time.Duration(cfg.InventoryInterval) * time.Second)
	auditTicker := time.NewTicker(time.Duration(cfg.AuditCheckInterval) * time.Second)

	defer metricsTicker.Stop()
	defer inventoryTicker.Stop()
	defer auditTicker.Stop()

	// Ticker SNMP separat (interval mai scurt, live)
	var snmpTicker *time.Ticker
	if snmpSender != nil {
		snmpTicker = time.NewTicker(time.Duration(cfg.SNMPInterval) * time.Second)
		defer snmpTicker.Stop()
	}

	// Colectare initiala
	go func() {
		log.Println("Collecting initial inventory...")
		if inv, err := inventoryCollector.Collect(); err == nil {
			if err := client.SendInventory(inv); err != nil {
				log.Printf("Error sending initial inventory: %v", err)
			}
		}
		// Container discovery initiala
		containers, cerr := collector.DiscoverContainersWithTimeout(60 * time.Second)
		if cerr != nil {
			log.Printf("Error discovering containers: %v", cerr)
		} else if len(containers) > 0 {
			if err := client.SendContainerInventory(containers); err != nil {
				log.Printf("Error sending container inventory: %v", err)
			} else {
				log.Printf("Sent initial container inventory: %d containers", len(containers))
			}
		}
	}()

	log.Printf("Agent started. Server: %s (ID: %s)", cfg.ServerURL, cfg.ServerID)

	// Canal SNMP (nil-safe — select ignora nil channels)
	var snmpChan <-chan time.Time
	if snmpTicker != nil {
		snmpChan = snmpTicker.C
	}

	for {
		select {
		case <-metricsTicker.C:
			// HTTP POST - persistare metrici in baza de date
			metrics, err := metricsCollector.Collect()
			if err != nil {
				log.Printf("Error collecting metrics: %v", err)
				continue
			}
			if err := client.SendMetrics(metrics); err != nil {
				log.Printf("Error sending metrics: %v", err)
			}

		case <-snmpChan:
			// SNMP Trap UDP - trimitere live (fire-and-forget)
			metrics, err := metricsCollector.Collect()
			if err != nil {
				log.Printf("Error collecting metrics for SNMP: %v", err)
				continue
			}
			detailed, err := metricsCollector.CollectDetailed()
			if err != nil {
				log.Printf("Error collecting detailed metrics: %v", err)
				continue
			}
			go func() {
				if err := snmpSender.SendMetricsTrap(metrics, detailed); err != nil {
					log.Printf("Error sending SNMP trap: %v", err)
				}
			}()

		case <-inventoryTicker.C:
			inv, err := inventoryCollector.Collect()
			if err != nil {
				log.Printf("Error collecting inventory: %v", err)
				continue
			}
			if err := client.SendInventory(inv); err != nil {
				log.Printf("Error sending inventory: %v", err)
			}
			// Container discovery pe fiecare inventory tick (goroutine separata)
			go func() {
				containers, cerr := collector.DiscoverContainersWithTimeout(60 * time.Second)
				if cerr != nil {
					log.Printf("Container discovery error: %v", cerr)
					return
				}
				if len(containers) == 0 {
					return
				}
				if err := client.SendContainerInventory(containers); err != nil {
					log.Printf("Error sending container inventory: %v", err)
				} else {
					log.Printf("Container inventory updated: %d containers", len(containers))
				}
			}()

		case <-auditTicker.C:
			// Verificare audituri in asteptare
			if err := auditRunner.CheckAndRun(); err != nil {
				log.Printf("Error running audit checks: %v", err)
			}

		case <-stopChan:
			log.Println("Shutting down agent...")
			return nil
		}
	}
}

// TestCollectors - depanare
func TestCollectors() error {
	fmt.Println("=== Test Colectori BitTrail Agent ===")
	fmt.Println()

	// Test metrici
	fmt.Println("--- Metrici ---")
	mc := collector.NewMetricsCollector()
	metrics, err := mc.Collect()
	if err != nil {
		fmt.Printf("Eroare metrici: %v\n", err)
	} else {
		fmt.Printf("CPU:    %.1f%%\n", metrics.CpuPercent)
		fmt.Printf("Memory: %.1f GB / %.1f GB\n", float64(metrics.MemUsedBytes)/1024/1024/1024, float64(metrics.MemTotalBytes)/1024/1024/1024)
		fmt.Printf("Disk:   %.1f GB / %.1f GB\n", float64(metrics.DiskUsedBytes)/1024/1024/1024, float64(metrics.DiskTotalBytes)/1024/1024/1024)
		fmt.Printf("Load:   %.2f / %.2f / %.2f\n", metrics.LoadAvg1, metrics.LoadAvg5, metrics.LoadAvg15)
		fmt.Printf("Network: In: %.1f MB, Out: %.1f MB\n", float64(metrics.NetInBytes)/1024/1024, float64(metrics.NetOutBytes)/1024/1024)
		if len(metrics.TopProcesses) > 0 {
			fmt.Printf("Top procs: %v\n", metrics.TopProcesses)
		}
	}

	fmt.Println()

	// Test inventar
	fmt.Println("--- Inventory ---")
	ic := collector.NewInventoryCollector()
	inv, err := ic.Collect()
	if err != nil {
		fmt.Printf("Eroare inventory: %v\n", err)
	} else {
		if hostname, ok := inv.OsInfo["hostname"].(string); ok {
			fmt.Printf("Hostname: %s\n", hostname)
		}
		if platform, ok := inv.OsInfo["platform"].(string); ok {
			if version, ok := inv.OsInfo["platformVersion"].(string); ok {
				fmt.Printf("OS: %s %s\n", platform, version)
			}
		}
		fmt.Printf("Porturi deschise: %d\n", len(inv.Ports))
		fmt.Printf("Utilizatori: %d\n", len(inv.Users))
		fmt.Printf("Pachete: %d\n", len(inv.Packages))
		fmt.Printf("Servicii: %d\n", len(inv.Services))
	}

	fmt.Println()
	fmt.Println("Test complet!")
	return nil
}
