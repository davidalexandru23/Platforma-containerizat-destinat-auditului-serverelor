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
	MetricsInterval   int `yaml:"metrics_interval"`   // secunde
	InventoryInterval int `yaml:"inventory_interval"` // secunde
	AuditCheckInterval int `yaml:"audit_check_interval"` // secunde
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

	// Defaults
	if cfg.MetricsInterval == 0 {
		cfg.MetricsInterval = 10
	}
	if cfg.InventoryInterval == 0 {
		cfg.InventoryInterval = 3600 // 1 ora
	}
	if cfg.AuditCheckInterval == 0 {
		cfg.AuditCheckInterval = 5
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
