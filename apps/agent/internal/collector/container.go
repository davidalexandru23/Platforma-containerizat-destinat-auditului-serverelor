package collector

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// ContainerInfo reprezinta un container descoperit pe gazda.
type ContainerInfo struct {
	ContainerID    string            `json:"containerId"`
	Runtime        string            `json:"runtime"` // docker | podman
	Name           string            `json:"name"`
	Image          string            `json:"image"`
	ImageTag       string            `json:"imageTag,omitempty"`
	ImageDigest    string            `json:"imageDigest,omitempty"`
	Status         string            `json:"status"`
	Running        bool              `json:"running"`
	StartedAt      string            `json:"startedAt,omitempty"`
	FinishedAt     string            `json:"finishedAt,omitempty"`
	Ports          []ContainerPort   `json:"ports,omitempty"`
	Mounts         []ContainerMount  `json:"mounts,omitempty"`
	RestartPolicy  string            `json:"restartPolicy,omitempty"`
	NetworkMode    string            `json:"networkMode,omitempty"`
	Privileged     bool              `json:"privileged"`
	RunningAsRoot  bool              `json:"runningAsRoot"`
	RunningAsUser  string            `json:"runningAsUser,omitempty"`
	Capabilities   []string          `json:"capabilities,omitempty"`
	SeccompProfile string            `json:"seccompProfile,omitempty"`
	AppArmorProfile string           `json:"appArmorProfile,omitempty"`
	ReadOnlyRootfs bool              `json:"readOnlyRootfs"`
	EnvVarCount    int               `json:"envVarCount"`
	HasHealthcheck bool              `json:"hasHealthcheck"`
	Labels         map[string]string `json:"labels,omitempty"`
	RawInspect     interface{}       `json:"rawInspect,omitempty"`
}

type ContainerPort struct {
	HostIP        string `json:"hostIp,omitempty"`
	HostPort      string `json:"hostPort,omitempty"`
	ContainerPort string `json:"containerPort"`
	Protocol      string `json:"protocol"`
}

type ContainerMount struct {
	Type        string `json:"type"`
	Source      string `json:"source,omitempty"`
	Destination string `json:"destination"`
	Mode        string `json:"mode,omitempty"`
	RW          bool   `json:"rw"`
}

// dockerPsEntry reprezinta o intrare din output-ul `docker ps --format json`.
type dockerPsEntry struct {
	ID      string `json:"ID"`
	Image   string `json:"Image"`
	Names   string `json:"Names"`
	Status  string `json:"Status"`
	State   string `json:"State"`
	Command string `json:"Command"`
	Ports   string `json:"Ports"`
}

// detectRuntime cauta docker sau podman in PATH.
// Returneaza lista of runtimes detectate.
func detectRuntime() []string {
	var runtimes []string
	for _, rt := range []string{"docker", "podman"} {
		if _, err := exec.LookPath(rt); err == nil {
			// Verifica ca daemonul este pornit (ping rapid)
			cmd := exec.Command(rt, "info", "--format", "{{.ID}}")
			cmd.Stdout = nil
			cmd.Stderr = nil
			if err2 := cmd.Run(); err2 == nil {
				runtimes = append(runtimes, rt)
			}
		}
	}
	return runtimes
}

// listContainerIDs returneaza lista de ID-uri de containere (toate, inclusiv oprite).
func listContainerIDs(runtime string) ([]string, error) {
	cmd := exec.Command(runtime, "ps", "-a", "--format", "{{.ID}}")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("%s ps failed: %w", runtime, err)
	}
	var ids []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		line = strings.TrimSpace(line)
		if line != "" {
			ids = append(ids, line)
		}
	}
	return ids, nil
}

// inspectContainer ruleaza `docker inspect <id>` si parseza primul element.
func inspectContainer(runtime, containerID string) (map[string]interface{}, error) {
	cmd := exec.Command(runtime, "inspect", containerID)
	var buf bytes.Buffer
	cmd.Stdout = &buf
	cmd.Stderr = nil
	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("%s inspect %s failed: %w", runtime, containerID, err)
	}

	var result []map[string]interface{}
	if err := json.Unmarshal(buf.Bytes(), &result); err != nil {
		return nil, fmt.Errorf("json parse error: %w", err)
	}
	if len(result) == 0 {
		return nil, fmt.Errorf("empty inspect output for %s", containerID)
	}
	return result[0], nil
}

// parseInspect transforma output-ul brut al inspect intr-un ContainerInfo.
func parseInspect(runtime string, raw map[string]interface{}) ContainerInfo {
	ci := ContainerInfo{
		Runtime:    runtime,
		RawInspect: raw,
	}

	// ID & Name
	ci.ContainerID = safeString(raw, "Id")
	if len(ci.ContainerID) > 12 {
		ci.ContainerID = ci.ContainerID[:12]
	}
	if names, ok := raw["Name"].(string); ok {
		ci.Name = strings.TrimPrefix(names, "/")
	}

	// Config
	if config, ok := raw["Config"].(map[string]interface{}); ok {
		ci.Image = safeString(config, "Image")
		// ENV count (fara valori)
		if envs, ok := config["Env"].([]interface{}); ok {
			ci.EnvVarCount = len(envs)
		}
		ci.RunningAsUser = safeString(config, "User")
		ci.Labels = parseLabels(config["Labels"])

		// Healthcheck
		if hc, ok := config["Healthcheck"].(map[string]interface{}); ok {
			if test, ok := hc["Test"].([]interface{}); ok {
				if len(test) > 0 {
					first := fmt.Sprintf("%v", test[0])
					ci.HasHealthcheck = first != "NONE" && first != ""
				}
			}
		}
	}

	// Image tag parsing
	if parts := strings.SplitN(ci.Image, ":", 2); len(parts) == 2 {
		ci.ImageTag = parts[1]
	}

	// RepoDigests
	if digests, ok := raw["RepoDigests"].([]interface{}); ok && len(digests) > 0 {
		ci.ImageDigest = fmt.Sprintf("%v", digests[0])
	}

	// State
	if state, ok := raw["State"].(map[string]interface{}); ok {
		ci.Status = safeString(state, "Status")
		ci.Running = safeBool(state, "Running")
		ci.StartedAt = safeString(state, "StartedAt")
		ci.FinishedAt = safeString(state, "FinishedAt")
	}

	// HostConfig
	if hc, ok := raw["HostConfig"].(map[string]interface{}); ok {
		ci.Privileged = safeBool(hc, "Privileged")
		ci.ReadOnlyRootfs = safeBool(hc, "ReadonlyRootfs")
		ci.NetworkMode = safeString(hc, "NetworkMode")

		// RestartPolicy
		if rp, ok := hc["RestartPolicy"].(map[string]interface{}); ok {
			ci.RestartPolicy = safeString(rp, "Name")
		}

		// CapAdd
		if capAdd, ok := hc["CapAdd"].([]interface{}); ok {
			for _, c := range capAdd {
				ci.Capabilities = append(ci.Capabilities, fmt.Sprintf("%v", c))
			}
		}

		// SecurityOpt — seccomp si apparmor
		if securityOpts, ok := hc["SecurityOpt"].([]interface{}); ok {
			for _, opt := range securityOpts {
				s := fmt.Sprintf("%v", opt)
				if strings.HasPrefix(s, "seccomp=") {
					ci.SeccompProfile = strings.TrimPrefix(s, "seccomp=")
				}
				if strings.HasPrefix(s, "apparmor=") {
					ci.AppArmorProfile = strings.TrimPrefix(s, "apparmor=")
				}
			}
		}
	}

	// RunningAsRoot logic
	user := strings.TrimSpace(ci.RunningAsUser)
	ci.RunningAsRoot = user == "" || user == "0" || user == "root"

	// Mounts
	if mounts, ok := raw["Mounts"].([]interface{}); ok {
		for _, m := range mounts {
			if mmap, ok := m.(map[string]interface{}); ok {
				mount := ContainerMount{
					Type:        safeString(mmap, "Type"),
					Source:      safeString(mmap, "Source"),
					Destination: safeString(mmap, "Destination"),
					Mode:        safeString(mmap, "Mode"),
					RW:          safeBool(mmap, "RW"),
				}
				ci.Mounts = append(ci.Mounts, mount)
			}
		}
	}

	// Ports
	if ns, ok := raw["NetworkSettings"].(map[string]interface{}); ok {
		if ports, ok := ns["Ports"].(map[string]interface{}); ok {
			for portProto, bindings := range ports {
				parts := strings.SplitN(portProto, "/", 2)
				cPort := parts[0]
				proto := "tcp"
				if len(parts) == 2 {
					proto = parts[1]
				}
				if bindList, ok := bindings.([]interface{}); ok {
					for _, b := range bindList {
						if bmap, ok := b.(map[string]interface{}); ok {
							ci.Ports = append(ci.Ports, ContainerPort{
								HostIP:        safeString(bmap, "HostIp"),
								HostPort:      safeString(bmap, "HostPort"),
								ContainerPort: cPort,
								Protocol:      proto,
							})
						}
					}
				}
			}
		}
	}

	return ci
}

// DiscoverContainers detecteaza rultime-urile disponibile si returneaza lista containerelor.
func DiscoverContainers() ([]ContainerInfo, error) {
	runtimes := detectRuntime()
	if len(runtimes) == 0 {
		return nil, nil // Niciun runtime detectat — nu e eroare
	}

	var all []ContainerInfo
	seen := map[string]bool{}

	for _, rt := range runtimes {
		ids, err := listContainerIDs(rt)
		if err != nil {
			continue
		}

		for _, id := range ids {
			if seen[id] {
				continue
			}
			seen[id] = true

			raw, err := inspectContainer(rt, id)
			if err != nil {
				continue
			}

			ci := parseInspect(rt, raw)
			all = append(all, ci)
		}
	}

	return all, nil
}

// DiscoverContainersWithTimeout ruleaza DiscoverContainers cu timeout.
func DiscoverContainersWithTimeout(timeout time.Duration) ([]ContainerInfo, error) {
	type result struct {
		containers []ContainerInfo
		err        error
	}
	ch := make(chan result, 1)
	go func() {
		c, e := DiscoverContainers()
		ch <- result{c, e}
	}()
	select {
	case r := <-ch:
		return r.containers, r.err
	case <-time.After(timeout):
		return nil, fmt.Errorf("container discovery timed out after %v", timeout)
	}
}

// Utilitare de parsare sigura a map-urilor JSON

func safeString(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

func safeBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok {
		if b, ok2 := v.(bool); ok2 {
			return b
		}
	}
	return false
}

func parseLabels(raw interface{}) map[string]string {
	labels := make(map[string]string)
	if raw == nil {
		return labels
	}
	if m, ok := raw.(map[string]interface{}); ok {
		for k, v := range m {
			labels[k] = fmt.Sprintf("%v", v)
		}
	}
	return labels
}
