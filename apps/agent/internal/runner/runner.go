package runner

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"bittrail-agent/internal/api"
	"bittrail-agent/internal/collector"
	"bittrail-agent/internal/config"
)

func Run(cfg *config.Config, version string) error {
	fmt.Println()
	fmt.Println("=== BitTrail Agent v" + version + " ===")
	fmt.Println()
	fmt.Printf("Server ID:  %s\n", cfg.ServerID)
	fmt.Printf("Backend:    %s\n", cfg.ServerURL)
	fmt.Printf("Metrici:    fiecare %ds\n", cfg.MetricsInterval)
	fmt.Printf("Inventar:   fiecare %ds\n", cfg.InventoryInterval)
	fmt.Println()
	fmt.Println("Agent pornit. Apasare Ctrl+C pentru oprire.")
	fmt.Println()

	client := api.NewClient(cfg.ServerURL, cfg.ServerID, cfg.AgentToken)

	// Colectori
	metricsCollector := collector.NewMetricsCollector()
	inventoryCollector := collector.NewInventoryCollector()
	auditRunner := collector.NewAuditRunner()

	// Canale oprire
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	// Tickere
	metricsTicker := time.NewTicker(time.Duration(cfg.MetricsInterval) * time.Second)
	inventoryTicker := time.NewTicker(time.Duration(cfg.InventoryInterval) * time.Second)
	auditTicker := time.NewTicker(time.Duration(cfg.AuditCheckInterval) * time.Second)

	// Colectare imediata la pornire
	go sendMetrics(client, metricsCollector)
	go sendInventory(client, inventoryCollector)

	for {
		select {
		case <-metricsTicker.C:
			go sendMetrics(client, metricsCollector)

		case <-inventoryTicker.C:
			go sendInventory(client, inventoryCollector)

		case <-auditTicker.C:
			go checkPendingAudits(client, auditRunner)

		case <-stop:
			fmt.Println()
			fmt.Println("Oprire agent...")
			return nil
		}
	}
}

func sendMetrics(client *api.Client, mc *collector.MetricsCollector) {
	metrics, err := mc.Collect()
	if err != nil {
		fmt.Printf("[WARN] Eroare colectare metrici: %v\n", err)
		return
	}

	if err := client.SendMetrics(metrics); err != nil {
		fmt.Printf("[WARN] Eroare trimitere metrici: %v\n", err)
	}
}

func sendInventory(client *api.Client, ic *collector.InventoryCollector) {
	inventory, err := ic.Collect()
	if err != nil {
		fmt.Printf("[WARN] Eroare colectare inventory: %v\n", err)
		return
	}

	if err := client.SendInventory(inventory); err != nil {
		fmt.Printf("[WARN] Eroare trimitere inventory: %v\n", err)
	} else {
		fmt.Println("[INFO] Inventory actualizat")
	}
}

func checkPendingAudits(client *api.Client, ar *collector.AuditRunner) {
	checks, err := client.GetPendingChecks()
	if err != nil {
		return // Silentios daca nu sunt checks
	}

	if len(checks) == 0 {
		return
	}

	fmt.Printf("[INFO] Procesare %d controale audit...\n", len(checks))

	// Grupare per AuditRunID
	byRun := make(map[string][]api.PendingCheck)
	for _, check := range checks {
		byRun[check.AuditRunID] = append(byRun[check.AuditRunID], check)
	}

	for auditRunID, runChecks := range byRun {
		results := ar.RunChecks(runChecks)
		if err := client.SendCheckResults(auditRunID, results); err != nil {
			fmt.Printf("[WARN] Eroare trimitere rezultate audit: %v\n", err)
		} else {
			fmt.Printf("[INFO] Trimis %d rezultate pentru audit %s\n", len(results), auditRunID[:8])
		}
	}
}

// TestCollectors - pentru depanare
func TestCollectors() error {
	fmt.Println("=== Test Colectori BitTrail Agent ===")
	fmt.Println()

	// test metrici
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

	// test inventory
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
