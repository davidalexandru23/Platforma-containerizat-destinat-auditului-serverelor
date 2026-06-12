package enrollment

import (
	"bytes"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"runtime"

	"bittrail-agent/internal/config"
	"bittrail-agent/internal/crypto"
)

type enrollRequest struct {
	EnrollToken string `json:"enrollToken"`
	Version     string `json:"version"`
	OsInfo      string `json:"osInfo"`
	Csr         string `json:"csr"` // Cerere semnare certificat
}

type enrollResponse struct {
	AgentToken       string `json:"agentToken"`
	ServerID         string `json:"serverId"`
	ServerName       string `json:"serverName"`
	Certificate      string `json:"certificate"`      // Certificat semnat primit
	BackendPublicKey string `json:"backendPublicKey"` // Cheie publica backend primita
	Message          string `json:"message"`
}

func Enroll(serverURL, token, configPath, version string) error {
	// Generare pereche chei RSA
	fmt.Println("[PKI] Generating RSA Key Pair...")
	privKey, err := crypto.GenerateKeyPair()
	if err != nil {
		return fmt.Errorf("failed to generate key pair: %w", err)
	}

	// Generare CSR (cerere semnare certificat)
	hostname, _ := os.Hostname()
	fmt.Println("[PKI] Generating Certificate Signing Request (CSR)...")
	csrBytes, err := crypto.GenerateCSR(privKey, hostname)
	if err != nil {
		return fmt.Errorf("failed to generate CSR: %w", err)
	}

	osInfo := fmt.Sprintf("%s/%s - %s", runtime.GOOS, runtime.GOARCH, hostname)

	reqData := enrollRequest{
		EnrollToken: token,
		Version:     version,
		OsInfo:      osInfo,
		Csr:         string(csrBytes),
	}

	body, err := json.Marshal(reqData)
	if err != nil {
		return err
	}

	fmt.Printf("Conectare la %s...\n", serverURL)

	// Trimitere request enrollment catre backend
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

	// Salvare configurare agent
	cfg := &config.Config{
		ServerID:           result.ServerID,
		ServerURL:          serverURL,
		AgentToken:         result.AgentToken,
		MetricsInterval:    10,
		InventoryInterval:  3600,
		AuditCheckInterval: 5,
		CertFile:           filepath.Join(filepath.Dir(configPath), "certs", "agent.crt"),
		KeyFile:            filepath.Join(filepath.Dir(configPath), "certs", "agent.key"),
		BackendKeyFile:     filepath.Join(filepath.Dir(configPath), "certs", "backend.pub"),
	}

	// Creare directoare lipsa
	dir := filepath.Dir(configPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("eroare la crearea directorului %s: %w", dir, err)
	}

	// Asigurare existenta director certificate
	certDir := filepath.Join(dir, "certs")
	if err := os.MkdirAll(certDir, 0755); err != nil {
		return fmt.Errorf("failed to create certs dir: %w", err)
	}

	// Salvare chei si certificate pe disc
	fmt.Println("[PKI] Saving certificates and keys...")

	// Salvare cheie privata agent
	privKeyBytes := x509.MarshalPKCS1PrivateKey(privKey)
	if err := crypto.SavePEM(cfg.KeyFile, "RSA PRIVATE KEY", privKeyBytes); err != nil {
		return fmt.Errorf("failed to save private key: %w", err)
	}

	// Salvare certificat semnat de CA
	if err := crypto.SaveFile(cfg.CertFile, []byte(result.Certificate)); err != nil {
		return fmt.Errorf("failed to save certificate: %w", err)
	}

	// Salvare cheie publica backend pentru verificare comenzi
	if err := crypto.SaveFile(cfg.BackendKeyFile, []byte(result.BackendPublicKey)); err != nil {
		return fmt.Errorf("failed to save backend key: %w", err)
	}

	if err := config.Save(configPath, cfg); err != nil {
		return fmt.Errorf("eroare la salvarea configurarii: %w", err)
	}

	// Verificare validitate certificat primit
	block, _ := pem.Decode([]byte(result.Certificate))
	if block == nil {
		fmt.Println("[WARNING] Received invalid certificate PEM")
	} else {
		cert, err := x509.ParseCertificate(block.Bytes)
		if err == nil {
			fmt.Printf("[PKI] Certificate valid until: %s\n", cert.NotAfter)
			fmt.Printf("[PKI] Serial Number: %s\n", cert.SerialNumber)
		}
	}

	fmt.Println()
	fmt.Println("       BitTrail Agent inrolat cu succes!         ")
	fmt.Println()
	fmt.Printf("  Server:      %s\n", result.ServerName)
	fmt.Printf("  Server ID:   %s\n", result.ServerID)
	fmt.Printf("  Config:      %s\n", configPath)
	fmt.Println()
	fmt.Println("Pasul urmator:")
	fmt.Println()
	fmt.Println("  1. Pornire ca serviciu (Recomandat):")
	fmt.Println("     sudo systemctl start bittrail-agent")
	fmt.Println()
	fmt.Println("  2. Sau pornire standalone (Manual):")
	fmt.Println("     sudo ./bittrail-agent run")
	fmt.Println()

	return nil
}
