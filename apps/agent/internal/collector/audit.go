package collector

import (
	"context"
	"os/exec"
	"regexp"
	"strconv"
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
	maxRetries := 5
	var result api.CheckResult
	var lastErr error

	// Retry mechanism: Tries to execute the check up to maxRetries times.
	// This ensures transient issues (e.g. temporary lock files, busy resources) don't cause false failures.
	for attempt := 1; attempt <= maxRetries; attempt++ {
		result = api.CheckResult{
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

		cmd := exec.CommandContext(ctx, "sh", "-c", check.Command)
		output, err := cmd.CombinedOutput()
		cancel() // Call cancel immediately after command finishes

		result.Output = strings.TrimSpace(string(output))

		if err != nil {
			lastErr = err
			// Timeout
			if ctx.Err() == context.DeadlineExceeded {
				result.Status = "ERROR"
				result.ErrorMessage = "Timeout (30s)"
			} else {
				// Exit code != 0 or other error
				// Daca avem expected result, verificam daca output-ul e totusi corect (uneori exit code e != 0 dar rezultatul e bun?)
				// De regula, exit code != 0 inseamna eroare, dar sa fim flexibili daca userul a definit un expected result.
				if check.ExpectedResult != "" {
					if matchesExpected(result.Output, check) {
						result.Status = "PASS"
					} else {
						result.Status = "FAIL"
						if check.OnFailMessage != "" {
							result.ErrorMessage = check.OnFailMessage
						}
						// Daca e FAIL logic, nu mai facem retry
						break
					}
				} else {
					result.Status = "FAIL"
					result.ErrorMessage = err.Error()
					// Check failed execution? Retry might help if it was permission denied intermittent or resource busy?
					// But usually exit code != 0 is permanent. Let's assume retry if it's "ERROR" but here we marked logic FAIL.
					break
				}
			}
		} else {
			// Success (exit code 0)
			if check.ExpectedResult != "" {
				if matchesExpected(result.Output, check) {
					result.Status = "PASS"
				} else {
					result.Status = "FAIL"
					if check.OnFailMessage != "" {
						result.ErrorMessage = check.OnFailMessage
					}
				}
			} else {
				// If no expected result, assume PASS if exit code 0
				result.Status = "PASS"
			}
			// Don't retry on success or logical fail/pass
			break
		}

		// If we are here, it's an ERROR (timeout or execution error not handled above). Retry.
		if attempt < maxRetries {
			time.Sleep(1 * time.Second)
		}
	}

	// Final check if ERROR persists after retries
	if result.Status == "ERROR" {
		if lastErr != nil {
			result.ErrorMessage = lastErr.Error()
		} else {
			result.ErrorMessage = "Verification failed after 5 attempts"
		}
	}

	return result
}

// matchesExpected verifica output-ul bazat pe criteriile din check
func matchesExpected(output string, check api.PendingCheck) bool {
	// 1. Normalizare (common)
	output = normalizeOutput(output, check.Normalize)
	expected := check.ExpectedResult

	// 2. Parser (basic for now)
	if check.Parser == "FIRST_LINE" {
		lines := strings.Split(output, "\n")
		if len(lines) > 0 {
			output = lines[0]
		}
	} else if check.Parser == "JSON" {
		// Passthrough for now, complex JSON parsing requires external libs or map[string]interface{}
		// Assuming comparisons are done on raw JSON string or extracted via basic string ops
	}

	// 3. Comparison
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
			// Invalid regex pattern treating as no match
			return false
		}
		return matched
	case "NUM_EQ", "NUM_GE", "NUM_LE", "NUM_GT", "NUM_LT":
		return compareNumeric(output, expected, comparison)
	default:
		// Default to equals
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
			// Replace multiple spaces with single space
			fields := strings.Fields(val)
			val = strings.Join(fields, " ")
		}
	}
	return val
}

func compareNumeric(actualStr, expectedStr, op string) bool {
	// Extract numbers (basic float parsing)
	actualVal, err1 := strconv.ParseFloat(actualStr, 64)
	expectedVal, err2 := strconv.ParseFloat(expectedStr, 64)

	if err1 != nil || err2 != nil {
		return false // Not numbers
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
