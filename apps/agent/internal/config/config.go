package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	ServerID   string `yaml:"server_id"`
	ServerURL  string `yaml:"server_url"`
	AgentToken string `yaml:"agent_token"`

	// Intervale colectare
	MetricsInterval    int `yaml:"metrics_interval"`     // secunde
	InventoryInterval  int `yaml:"inventory_interval"`   // secunde
	AuditCheckInterval int `yaml:"audit_check_interval"` // secunde

	// Configurare PKI
	KeyFile        string `yaml:"key_file"`
	CertFile       string `yaml:"cert_file"`
	BackendKeyFile string `yaml:"backend_key_file"`

	// Securitate / PKI
	AgentKeyPath   string `yaml:"agent_key_path"`
	AgentCertPath  string `yaml:"agent_cert_path"`
	CACertPath     string `yaml:"ca_cert_path"`
	BackendPubPath string `yaml:"backend_pub_path"`
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

	// Valori implicite
	if cfg.MetricsInterval == 0 {
		cfg.MetricsInterval = 10
	}
	if cfg.InventoryInterval == 0 {
		cfg.InventoryInterval = 3600 // 1 ora
	}
	if cfg.AuditCheckInterval == 0 {
		cfg.AuditCheckInterval = 5
	}

	// Valori implicite securitate
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
