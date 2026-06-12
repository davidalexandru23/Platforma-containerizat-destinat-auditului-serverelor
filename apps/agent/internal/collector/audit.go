package collector

import (
	"context"
	"crypto/rsa"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/user"
	"regexp"
	"strconv"
	"strings"
	"time"

	"bittrail-agent/internal/api"
	"bittrail-agent/internal/crypto"
)

type AuditRunner struct {
	client     *api.Client
	privateKey *rsa.PrivateKey
	backendKey []byte
}

func NewAuditRunner(client *api.Client, keyPath, backendKeyPath string) *AuditRunner {
	var privKey *rsa.PrivateKey
	var backendKey []byte

	if keyPath != "" {
		pk, err := crypto.LoadPrivateKey(keyPath)
		if err != nil {
			log.Printf("WARNING: Failed to load agent private key: %v. Signing disabled.", err)
		} else {
			privKey = pk
		}
	}

	if backendKeyPath != "" {
		bk, err := os.ReadFile(backendKeyPath)
		if err != nil {
			log.Printf("WARNING: Failed to load backend public key: %v. Signature verification disabled.", err)
		} else {
			backendKey = bk
		}
	}

	return &AuditRunner{
		client:     client,
		privateKey: privKey,
		backendKey: backendKey,
	}
}

func (ar *AuditRunner) CheckAndRun() error {
	checks, err := ar.client.GetPendingChecks()
	if err != nil {
		return err
	}

	if len(checks) == 0 {
		return nil
	}

	log.Printf("Received %d pending checks", len(checks))

	// Grupare dupa AuditRunID pentru trimitere in loturi
	resultsByRun := make(map[string][]api.CheckResult)

	for _, check := range checks {
		// Verificare semnatura (daca exista cheie backend)
		if len(ar.backendKey) > 0 && check.Signature != "" {
			verifyData := check.Command + check.CheckID
			if err := crypto.VerifySignature(ar.backendKey, []byte(verifyData), check.Signature); err != nil {
				log.Printf("SECURITY ALERT: Signature verification failed for check %s: %v", check.CheckID, err)
				resultsByRun[check.AuditRunID] = append(resultsByRun[check.AuditRunID], api.CheckResult{
					AutomatedCheckID: check.AutomatedCheckID,
					Status:           "ERROR",
					ErrorMessage:     "Security Error: Invalid Signature",
				})
				continue
			}
		}

		// Executare verificare
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		output, exitCode, err := ar.executeCheck(ctx, check)
		cancel()

		// Populare metadate Chain of Custody
		hostname, _ := os.Hostname()
		currentUser, _ := user.Current()
		username := "unknown"
		if currentUser != nil {
			username = currentUser.Username
		}
		timestamp := time.Now().Format(time.RFC3339)

		// Redactare secrete din output
		redactedOutput := crypto.RedactSecrets(output)
		outputHash := crypto.CalculateHash(redactedOutput)

		result := api.CheckResult{
			AutomatedCheckID: check.AutomatedCheckID,
			Status:           "FAIL",
			Output:           redactedOutput,
			// Campuri Chain of Custody
			OutputHash:    outputHash,
			ExecTimestamp: timestamp,
			ExecHostname:  hostname,
			ExecUser:      username,
			ExitCode:      exitCode,
		}

		if err != nil {
			result.Status = "ERROR"
			result.ErrorMessage = err.Error()
			if ctx.Err() == context.DeadlineExceeded {
				result.ErrorMessage = "Timeout (30s)"
			}
		} else {
			// Evaluare succes (exit code 0 sau gestionat)
			if check.ExpectedResult != "" {
				if matchesExpected(redactedOutput, check) {
					result.Status = "PASS"
				}
			} else {
				// Returnare PASS daca exit code 0 (fara valoare asteptata)
				if exitCode == 0 {
					result.Status = "PASS"
				}
			}
		}

		// Semnare rezultat
		if ar.privateKey != nil {
			// Construire payload semnatura: OutputHash + Status + Timestamp
			signData := result.OutputHash + result.Status + result.ExecTimestamp
			sig, err := crypto.SignData(ar.privateKey, []byte(signData))
			if err == nil {
				result.Signature = sig
			} else {
				log.Printf("Error signing result: %v", err)
			}
		}

		resultsByRun[check.AuditRunID] = append(resultsByRun[check.AuditRunID], result)
	}

	// Trimitere rezultate grupate catre backend
	for runID, results := range resultsByRun {
		if err := ar.client.SendCheckResults(runID, results); err != nil {
			log.Printf("Failed to send results for run %s: %v", runID, err)
		} else {
			log.Printf("Sent %d results for run %s", len(results), runID)
		}
	}

	return nil
}

func (ar *AuditRunner) executeCheck(ctx context.Context, check api.PendingCheck) (string, int, error) {
	// Verificare siguranta comanda (ultima linie de aparare)
	cmdToCheck := check.Command
	if check.CheckType == "SCRIPT" {
		cmdToCheck = check.Script
	}
	if safe, reason := isCommandSafe(cmdToCheck); !safe {
		log.Printf("[SECURITY] Comanda BLOCATA pe agent: %s - motiv: %s", cmdToCheck, reason)
		return "", -1, fmt.Errorf("comanda blocata de agent: %s", reason)
	}

	// Gestionare speciala: CONTAINER_DISCOVERY trigger
	// Determinare agent sa ruleze container discovery
	if check.CheckType == "CONTAINER_DISCOVERY" {
		return "CONTAINER_DISCOVERY_TRIGGER", 0, nil
	}

	var cmd *exec.Cmd

	if check.CheckType == "SCRIPT" {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", check.Script)
	} else {
		// Executare COMMAND, CONTAINER_EXEC si orice alt tip ca shell commands
		// Interpolare prealabila a CONTAINER_ID si RUNTIME de catre backend
		// (ex: "docker inspect <id>")
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", check.Command)
	}

	output, err := cmd.CombinedOutput()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
		}
	}

	return string(output), exitCode, err
}

// Definire blacklist minimal pe agent
var dangerousPatterns = []*regexp.Regexp{
	regexp.MustCompile(`\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)*\/`),
	regexp.MustCompile(`\bdd\s+`),
	regexp.MustCompile(`\bmkfs\b`),
	regexp.MustCompile(`\bshutdown\b`),
	regexp.MustCompile(`(^|[;&|]\s*)reboot(\s|$)`),
	regexp.MustCompile(`\bpoweroff\b`),
	regexp.MustCompile(`\bhalt\b`),
	regexp.MustCompile(`\buseradd\b`),
	regexp.MustCompile(`\buserdel\b`),
	regexp.MustCompile(`\bpasswd\b`),
	regexp.MustCompile(`\bsystemctl\s+(start|stop|restart|enable|disable)\b`),
	regexp.MustCompile(`\biptables\s+-(F|X|D)\b`),
	regexp.MustCompile(`\beval\s+`),
	regexp.MustCompile(`\bexec\s+`),
}

// Verificare siguranta comanda pentru executie
func isCommandSafe(command string) (bool, string) {
	cmd := strings.TrimSpace(command)
	if cmd == "" {
		return true, ""
	}
	for _, p := range dangerousPatterns {
		if p.MatchString(cmd) {
			return false, p.String()
		}
	}
	return true, ""
}

// Verificare output conform criteriu asteptat
func matchesExpected(output string, check api.PendingCheck) bool {
	// Normalizare output
	output = normalizeOutput(output, check.Normalize)
	expected := check.ExpectedResult

	// Parsare output (basic)
	if check.Parser == "FIRST_LINE" {
		lines := strings.Split(output, "\n")
		if len(lines) > 0 {
			output = lines[0]
		}
	}

	// Comparare output cu valoare asteptata
	comparison := strings.ToUpper(check.Comparison)
	if comparison == "" {
		comparison = "EQUALS"
	}

	switch comparison {
	case "EQUALS":
		return output == expected
	case "CONTAINS":
		return strings.Contains(output, expected)
	case "REGEX":
		matched, err := regexp.MatchString(expected, output)
		if err != nil {
			return false
		}
		return matched
	case "NUM_EQ", "NUM_GE", "NUM_LE", "NUM_GT", "NUM_LT":
		return compareNumeric(output, expected, comparison)
	default:
		return output == expected
	}
}

func normalizeOutput(val string, rules []string) string {
	val = strings.TrimSpace(val)
	for _, rule := range rules {
		switch strings.ToUpper(rule) {
		case "LOWER":
			val = strings.ToLower(val)
		case "SQUASH_WS":
			fields := strings.Fields(val)
			val = strings.Join(fields, " ")
		}
	}
	return val
}

func compareNumeric(actualStr, expectedStr, op string) bool {
	actualVal, err1 := strconv.ParseFloat(actualStr, 64)
	expectedVal, err2 := strconv.ParseFloat(expectedStr, 64)

	if err1 != nil || err2 != nil {
		return false
	}

	switch op {
	case "NUM_EQ":
		return actualVal == expectedVal
	case "NUM_GE":
		return actualVal >= expectedVal
	case "NUM_LE":
		return actualVal <= expectedVal
	case "NUM_GT":
		return actualVal > expectedVal
	case "NUM_LT":
		return actualVal < expectedVal
	}
	return false
}
