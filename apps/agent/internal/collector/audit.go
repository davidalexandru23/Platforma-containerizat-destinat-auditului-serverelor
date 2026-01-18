package collector

import (
	"context"
	"os/exec"
	"strings"
	"time"

	"bittrail-agent/internal/api"
)

type AuditRunner struct{}

func NewAuditRunner() *AuditRunner {
	return &AuditRunner{}
}

func (ar *AuditRunner) RunChecks(checks []api.PendingCheck) []api.CheckResult {
	var results []api.CheckResult

	for _, check := range checks {
		result := ar.runSingleCheck(check)
		results = append(results, result)
	}

	return results
}

func (ar *AuditRunner) runSingleCheck(check api.PendingCheck) api.CheckResult {
	result := api.CheckResult{
		AutomatedCheckID: check.AutomatedCheckID,
		Status:           "ERROR",
	}

	if check.CheckType != "COMMAND" || check.Command == "" {
		result.Status = "SKIPPED"
		result.Output = "Tip check nesuportat sau comanda lipsa"
		return result
	}

	// Executa comanda cu timeout de 30 secunde
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "sh", "-c", check.Command)
	output, err := cmd.CombinedOutput()

	result.Output = strings.TrimSpace(string(output))

	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			result.Status = "ERROR"
			result.ErrorMessage = "Timeout (30s)"
			return result
		}

		// Comanda a esuat cu exit code != 0
		// Verificam expected result
		if check.ExpectedResult != "" {
			if matchesExpected(result.Output, check.ExpectedResult) {
				result.Status = "PASS"
			} else {
				result.Status = "FAIL"
			}
		} else {
			// Fara expected result, exit code != 0 = FAIL
			result.Status = "FAIL"
			result.ErrorMessage = err.Error()
		}
		return result
	}

	// Comanda reusita, verificam expected result
	if check.ExpectedResult != "" {
		if matchesExpected(result.Output, check.ExpectedResult) {
			result.Status = "PASS"
		} else {
			result.Status = "FAIL"
		}
	} else {
		// Fara expected result, comanda reusita = PASS
		result.Status = "PASS"
	}

	return result
}

// matchesExpected verifica daca output-ul contine expected result
// Suporta si comparatie exacta si contains
func matchesExpected(output, expected string) bool {
	output = strings.TrimSpace(output)
	expected = strings.TrimSpace(expected)

	// Exact match
	if output == expected {
		return true
	}

	// Contains (case insensitive)
	if strings.Contains(strings.ToLower(output), strings.ToLower(expected)) {
		return true
	}

	// Numeric comparison for counts
	// Daca expected e "0" si output e "0\n" sau similar
	if expected == "0" && (output == "0" || output == "") {
		return true
	}

	return false
}
