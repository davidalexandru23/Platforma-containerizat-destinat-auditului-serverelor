package config

import (
	"net/url"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ServerID   string `yaml:"server_id"`
	ServerURL  string `yaml:"server_url"`
	AgentToken string `yaml:"agent_token"`

	// Intervale colectare metrici
	MetricsInterval    int `yaml:"metrics_interval"`     // secunde
	InventoryInterval  int `yaml:"inventory_interval"`   // secunde
	AuditCheckInterval int `yaml:"audit_check_interval"` // secunde

	// Configurare fisiere PKI
	KeyFile        string `yaml:"key_file"`
	CertFile       string `yaml:"cert_file"`
	BackendKeyFile string `yaml:"backend_key_file"`

	// Configurare securitate / PKI
	AgentKeyPath   string `yaml:"agent_key_path"`
	AgentCertPath  string `yaml:"agent_cert_path"`
	CACertPath     string `yaml:"ca_cert_path"`
	BackendPubPath string `yaml:"backend_pub_path"`

	// Configurare SNMP Trap sender
	SNMPEnabled   bool   `yaml:"snmp_enabled"`   // Activare trimitere trap-uri SNMP
	SNMPTarget    string `yaml:"snmp_target"`    // Host backend (IP direct, NU prin tunnel)
	SNMPPort      int    `yaml:"snmp_port"`      // Port UDP trap (implicit 11162)
	SNMPCommunity string `yaml:"snmp_community"` // Community string
	SNMPInterval  int    `yaml:"snmp_interval"`  // Interval trimitere trap-uri (secunde)
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}

	// Aplicare valori implicite
	if cfg.MetricsInterval == 0 {
		cfg.MetricsInterval = 60 // Persistare DB la 60s (mai rar, SNMP preia live)
	}
	if cfg.InventoryInterval == 0 {
		cfg.InventoryInterval = 3600 // 1 ora
	}
	if cfg.AuditCheckInterval == 0 {
		cfg.AuditCheckInterval = 5
	}

	// Aplicare valori implicite SNMP
	if cfg.SNMPPort == 0 {
		cfg.SNMPPort = 11162 // Port non-privilegiat
	}
	if cfg.SNMPCommunity == "" {
		cfg.SNMPCommunity = "bittrail"
	}
	if cfg.SNMPInterval == 0 {
		cfg.SNMPInterval = 5 // Trap la fiecare 5 secunde (live)
	}
	// Extragere host din server_url daca SNMP target nu e setat
	if cfg.SNMPTarget == "" && cfg.ServerURL != "" {
		if u, err := url.Parse(cfg.ServerURL); err == nil {
			cfg.SNMPTarget = u.Hostname()
		}
	}

	// Aplicare valori implicite securitate
	if cfg.AgentKeyPath == "" {
		cfg.AgentKeyPath = "certs/agent.key"
	}
	if cfg.AgentCertPath == "" {
		cfg.AgentCertPath = "certs/agent.crt"
	}
	if cfg.CACertPath == "" {
		cfg.CACertPath = "certs/ca.crt"
	}
	if cfg.BackendPubPath == "" {
		cfg.BackendPubPath = "certs/backend_pub.pem"
	}

	return &cfg, nil
}

func Save(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}
