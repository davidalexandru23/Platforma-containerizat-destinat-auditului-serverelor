package enrollment

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"bittrail-agent/internal/config"
)

type enrollRequest struct {
	EnrollToken string `json:"enrollToken"`
	Version     string `json:"version"`
	OsInfo      string `json:"osInfo"`
}

type enrollResponse struct {
	AgentToken string `json:"agentToken"`
	ServerID   string `json:"serverId"`
	ServerName string `json:"serverName"`
	Message    string `json:"message"`
}

func Enroll(serverURL, token, configPath, version string) error {
	// pregateste request
	hostname, _ := os.Hostname()
	osInfo := fmt.Sprintf("%s/%s - %s", runtime.GOOS, runtime.GOARCH, hostname)

	reqData := enrollRequest{
		EnrollToken: token,
		Version:     version,
		OsInfo:      osInfo,
	}

	body, err := json.Marshal(reqData)
	if err != nil {
		return err
	}

	fmt.Printf("Conectare la %s...\n", serverURL)

	// trimite request enrollment
	resp, err := http.Post(
		serverURL+"/api/agent/enroll",
		"application/json",
		bytes.NewBuffer(body),
	)
	if err != nil {
		return fmt.Errorf("eroare la conectare: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		var errResp map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&errResp)
		if msg, ok := errResp["message"].(string); ok {
			return fmt.Errorf("enrollment esuat: %s", msg)
		}
		return fmt.Errorf("enrollment esuat, status: %d", resp.StatusCode)
	}

	var result enrollResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return fmt.Errorf("eroare la parsare raspuns: %w", err)
	}

	// salveaza configurare
	cfg := &config.Config{
		ServerID:           result.ServerID,
		ServerURL:          serverURL,
		AgentToken:         result.AgentToken,
		MetricsInterval:    10,
		InventoryInterval:  3600,
		AuditCheckInterval: 5,
	}

	// creeaza directorul daca nu exista
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("eroare la crearea directorului %s: %w", dir, err)
	}

	if err := config.Save(configPath, cfg); err != nil {
		return fmt.Errorf("eroare la salvarea configurarii: %w", err)
	}

	fmt.Println()
	fmt.Println("╔══════════════════════════════════════════════════╗")
	fmt.Println("║      ✓ BitTrail Agent inrolat cu succes!         ║")
	fmt.Println("╚══════════════════════════════════════════════════╝")
	fmt.Println()
	fmt.Printf("  Server:      %s\n", result.ServerName)
	fmt.Printf("  Server ID:   %s\n", result.ServerID)
	fmt.Printf("  Config:      %s\n", configPath)
	fmt.Println()
	fmt.Println("Pasul urmator - porneste agentul:")
	fmt.Println()
	fmt.Println("  sudo ./bittrail-agent run")
	fmt.Println()
	fmt.Println("Sau instaleaza ca service systemd:")
	fmt.Println()
	fmt.Println("  sudo cp bittrail-agent /usr/local/bin/")
	fmt.Println("  sudo cp bittrail-agent.service /etc/systemd/system/")
	fmt.Println("  sudo systemctl enable --now bittrail-agent")
	fmt.Println()

	return nil
}
