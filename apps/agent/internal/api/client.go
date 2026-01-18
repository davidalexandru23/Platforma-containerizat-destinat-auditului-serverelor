package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	baseURL    string
	serverID   string
	agentToken string
	httpClient *http.Client
}

func NewClient(baseURL, serverID, agentToken string) *Client {
	return &Client{
		baseURL:    baseURL,
		serverID:   serverID,
		agentToken: agentToken,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *Client) SendMetrics(metrics interface{}) error {
	return c.post(fmt.Sprintf("/api/agent/%s/metrics", c.serverID), metrics)
}

func (c *Client) SendInventory(inventory interface{}) error {
	return c.post(fmt.Sprintf("/api/agent/%s/inventory", c.serverID), inventory)
}

type PendingCheck struct {
	AuditRunID       string `json:"auditRunId"`
	AutomatedCheckID string `json:"automatedCheckId"`
	CheckID          string `json:"checkId"`
	Title            string `json:"title"`
	Command          string `json:"command"`
	Script           string `json:"script"`
	ExpectedResult   string `json:"expectedResult"`
	CheckType        string `json:"checkType"`
}

func (c *Client) GetPendingChecks() ([]PendingCheck, error) {
	req, err := http.NewRequest("GET", c.baseURL+fmt.Sprintf("/api/agent/%s/audit/pending", c.serverID), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Agent-Token", c.agentToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("status: %d", resp.StatusCode)
	}

	var checks []PendingCheck
	if err := json.NewDecoder(resp.Body).Decode(&checks); err != nil {
		return nil, err
	}

	return checks, nil
}

type CheckResult struct {
	AutomatedCheckID string `json:"automatedCheckId"`
	Status           string `json:"status"` // PASS, FAIL, ERROR, SKIPPED
	Output           string `json:"output"`
	ErrorMessage     string `json:"errorMessage,omitempty"`
}

func (c *Client) SendCheckResults(auditRunID string, results []CheckResult) error {
	payload := map[string]interface{}{
		"results": results,
	}
	return c.post(fmt.Sprintf("/api/agent/%s/audit/%s/results", c.serverID, auditRunID), payload)
}

func (c *Client) post(path string, data interface{}) error {
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", c.baseURL+path, bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Agent-Token", c.agentToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("request failed with status: %d", resp.StatusCode)
	}

	return nil
}
