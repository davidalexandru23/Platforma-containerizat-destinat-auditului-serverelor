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

// Injectare versiune la compilare (-ldflags -X main.agentVersion=...)
var agentVersion = "dev"

func main() {
	rootCmd := &cobra.Command{
		Use:   "bittrail-agent",
		Short: "Agent pentru platforma BitTrail",
		Long: `BitTrail Agent - Monitorizare si audit servere Linux.

Acest agent se instaleaza pe server si:
- Colectare metrici sistem (CPU, RAM, disc, retea)
- Colectare inventar (SO, pachete, servicii, porturi, utilizatori)
- Executare verificari automate din sabloane audit
- Comunicare securizata cu backend BitTrail

Agentul necesita privilegii root pentru accesare informatii complete.

Exemplu utilizare:
  # Inrolare agent
  sudo ./bittrail-agent enroll --server https://bittrail.example.com --token abc123

  # Pornire agent continuu
  sudo ./bittrail-agent run

  # Verificare status
  ./bittrail-agent status`,
	}

	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "/etc/bittrail-agent/config.yaml", "fisier configurare")

	// Comanda inrolare
	enrollCmd := &cobra.Command{
		Use:   "enroll",
		Short: "Inrolare agent pe server",
		Long: `Inrolare agent cu backend BitTrail.

Pasul de inrolare:
1. Generare token din interfata web BitTrail (Servere -> Server -> Inrolare)
2. Rulare comanda enroll cu token generat
3. Salvare configuratie si pornire cu 'run'

Tokenul expira dupa 24 ore sau dupa prima utilizare.`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if os.Geteuid() != 0 {
				fmt.Println("ATENTIE: Inrolare ca non-root. Unele functionalitati pot fi limitate.")
			}
			return enrollment.Enroll(serverURL, enrollToken, cfgFile, agentVersion)
		},
	}
	enrollCmd.Flags().StringVar(&serverURL, "server", "", "URL backend (ex: https://bittrail.example.com)")
	enrollCmd.Flags().StringVar(&enrollToken, "token", "", "Token enrollment")
	enrollCmd.MarkFlagRequired("server")
	enrollCmd.MarkFlagRequired("token")
	rootCmd.AddCommand(enrollCmd)

	// Comanda rulare
	runCmd := &cobra.Command{
		Use:   "run",
		Short: "Pornire agent in mod continuu",
		Long: `Pornire agent in mod daemon.

Actiuni agent:
- Trimitere metrici la fiecare 10 secunde
- Actualizare inventar la fiecare ora
- Verificare si executare controale audit in asteptare

Pentru productie, utilizare serviciu systemd:
  sudo systemctl enable bittrail-agent
  sudo systemctl start bittrail-agent`,
		RunE: func(cmd *cobra.Command, args []string) error {
			if os.Geteuid() != 0 {
				fmt.Println("ATENTIE: Rulare ca non-root. Unele metrici/verificari pot fi indisponibile.")
			}
			cfg, err := config.Load(cfgFile)
			if err != nil {
				return fmt.Errorf("eroare la incarcarea configurarii: %w", err)
			}
			return runner.Run(cfg, agentVersion)
		},
	}
	rootCmd.AddCommand(runCmd)

	// Comanda status
	statusCmd := &cobra.Command{
		Use:   "status",
		Short: "Afiseaza statusul agentului",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := config.Load(cfgFile)
			if err != nil {
				return fmt.Errorf("agent neconfigurat: %w", err)
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

	// Comanda versiune
	versionCmd := &cobra.Command{
		Use:   "version",
		Short: "Afisare versiune agent",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Printf("BitTrail Agent v%s\n", agentVersion)
		},
	}
	rootCmd.AddCommand(versionCmd)

	// Comanda testare - pentru depanare
	testCmd := &cobra.Command{
		Use:   "test",
		Short: "Testare colectare metrici si inventar",
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
