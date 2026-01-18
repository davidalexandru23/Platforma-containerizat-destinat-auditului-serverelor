package main

import (
	"fmt"
	"os"

	"bittrail-agent/internal/config"
	"bittrail-agent/internal/enrollment"
	"bittrail-agent/internal/runner"

	"github.com/spf13/cobra"
)

var (
	cfgFile     string
	serverURL   string
	enrollToken string
)

const agentVersion = "1.0.0"

func main() {
	rootCmd := &cobra.Command{
		Use:   "bittrail-agent",
		Short: "Agent pentru platforma BitTrail",
		Long: `BitTrail Agent - Agent de monitorizare si audit pentru servere Linux.

Acest agent se instaleaza direct pe server si:
- Colecteaza metrici de sistem (CPU, RAM, disk, network)
- Colecteaza inventory (OS, pachete, servicii, porturi, useri)
- Executa verificari automate din template-urile de audit
- Comunica securizat cu backend-ul BitTrail

Agentul necesita permisiuni root pentru a accesa toate informatiile de sistem.

Exemplu utilizare:
  # Inrolare agent
  sudo ./bittrail-agent enroll --server https://bittrail.example.com --token abc123

  # Pornire agent continuu
  sudo ./bittrail-agent run

  # Verificare status
  ./bittrail-agent status`,
	}

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "/etc/bittrail-agent/config.yaml", "fisier configurare")

	// comanda enroll
	enrollCmd := &cobra.Command{
		Use:   "enroll",
		Short: "Inroleaza agentul pe server",
		Long: `Inroleaza agentul cu backend-ul BitTrail.

Pasul de enrollment:
1. Genereaza token din interfata web BitTrail (Servers -> Server -> Enrollment)
2. Ruleaza comanda enroll cu token-ul generat
3. Agentul salveaza configuratia si poate fi pornit cu 'run'

Token-ul expira dupa 24 ore sau dupa prima utilizare.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if os.Geteuid() != 0 {
				fmt.Println("ATENTIE: Enrollment ca non-root. Unele functii pot fi limitate.")
			}
			return enrollment.Enroll(serverURL, enrollToken, cfgFile, agentVersion)
		},
	}
	enrollCmd.Flags().StringVar(&serverURL, "server", "", "URL backend (ex: https://bittrail.example.com)")
	enrollCmd.Flags().StringVar(&enrollToken, "token", "", "Token enrollment")
	enrollCmd.MarkFlagRequired("server")
	enrollCmd.MarkFlagRequired("token")
	rootCmd.AddCommand(enrollCmd)

	// comanda run
	runCmd := &cobra.Command{
		Use:   "run",
		Short: "Porneste agentul in mod continuu",
		Long: `Porneste agentul in mod daemon.

Agentul va:
- Trimite metrici la fiecare 10 secunde
- Actualiza inventory la fiecare ora
- Verifica si executa checks de audit in asteptare

Pentru productie, foloseste un service systemd:
  sudo systemctl enable bittrail-agent
  sudo systemctl start bittrail-agent`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if os.Geteuid() != 0 {
				fmt.Println("ATENTIE: Rulare ca non-root. Unele metrici/checks pot fi indisponibile.")
			}
			cfg, err := config.Load(cfgFile)
			if err != nil {
				return fmt.Errorf("eroare la incarcarea configurarii: %w", err)
			}
			return runner.Run(cfg, agentVersion)
		},
	}
	rootCmd.AddCommand(runCmd)

	// comanda status
	statusCmd := &cobra.Command{
		Use:   "status",
		Short: "Afiseaza statusul agentului",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load(cfgFile)
			if err != nil {
				return fmt.Errorf("agent nu este configurat: %w", err)
			}
			fmt.Println("=== BitTrail Agent Status ===")
			fmt.Printf("Version:       %s\n", agentVersion)
			fmt.Printf("Server ID:     %s\n", cfg.ServerID)
			fmt.Printf("Backend URL:   %s\n", cfg.ServerURL)
			fmt.Printf("Config File:   %s\n", cfgFile)
			if len(cfg.AgentToken) > 8 {
				fmt.Printf("Agent Token:   %s...%s\n", cfg.AgentToken[:4], cfg.AgentToken[len(cfg.AgentToken)-4:])
			}
			fmt.Printf("Metrics Int:   %ds\n", cfg.MetricsInterval)
			fmt.Printf("Inventory Int: %ds\n", cfg.InventoryInterval)
			return nil
		},
	}
	rootCmd.AddCommand(statusCmd)

	// comanda version
	versionCmd := &cobra.Command{
		Use:   "version",
		Short: "Afiseaza versiunea agentului",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("BitTrail Agent v%s\n", agentVersion)
		},
	}
	rootCmd.AddCommand(versionCmd)

	// comanda test - pt debugging
	testCmd := &cobra.Command{
		Use:   "test",
		Short: "Testeaza colectarea de metrici si inventory",
		RunE: func(cmd *cobra.Command, args []string) error {
			return runner.TestCollectors()
		},
	}
	rootCmd.AddCommand(testCmd)

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
