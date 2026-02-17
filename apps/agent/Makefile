# BitTrail Agent - Makefile

BINARY_NAME=bittrail-agent
VERSION=$(shell date +%Y.%m.%d)
BUILD_DIR=build
BACKEND_PUBLIC=../backend/public

# Default target OS/ARCH (x86_64 Linux)
GOOS=linux
GOARCH=amd64

.PHONY: all build build-linux build-all clean install test publish publish-all

# Build pentru x86_64 Linux (implicit)
all: build

build:
	@echo "Building $(BINARY_NAME) for $(GOOS)/$(GOARCH)..."
	@mkdir -p $(BUILD_DIR)
	GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=0 go build \
		-ldflags="-s -w -X main.agentVersion=$(VERSION)" \
		-o $(BUILD_DIR)/$(BINARY_NAME) \
		./cmd/agent
	@echo "Built: $(BUILD_DIR)/$(BINARY_NAME)"

# Build explicit Linux x86_64
build-linux: GOOS=linux
build-linux: GOARCH=amd64
build-linux: build

# Build pentru Linux ARM64 (Raspberry Pi, etc)
build-linux-arm64:
	@echo "Building $(BINARY_NAME) for linux/arm64..."
	@mkdir -p $(BUILD_DIR)
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build \
		-ldflags="-s -w -X main.agentVersion=$(VERSION)" \
		-o $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 \
		./cmd/agent

# Build pentru toate platformele
build-all: build-linux build-linux-arm64
	@echo "All builds complete!"

# Clean
clean:
	@rm -rf $(BUILD_DIR)
	@echo "Cleaned build directory"

# Instalare locala (doar dev macOS/Linux)
install: build
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/
	@sudo chmod +x /usr/local/bin/$(BINARY_NAME)
	@echo "Installed to /usr/local/bin/$(BINARY_NAME)"

# Publicare - copiere binar in backend
publish: build
	@echo "Publishing agent to backend..."
	@mkdir -p $(BACKEND_PUBLIC)
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(BACKEND_PUBLIC)/
	@cp install.sh $(BACKEND_PUBLIC)/
	@cp update.sh $(BACKEND_PUBLIC)/ 2>/dev/null || true
	@cp uninstall.sh $(BACKEND_PUBLIC)/ 2>/dev/null || true
	@echo '{"version":"$(VERSION)","buildDate":"$(shell date -u +%Y-%m-%dT%H:%M:%SZ)","arch":"linux-amd64"}' > $(BACKEND_PUBLIC)/agent-version.json
	@echo "Published: version $(VERSION)"

# Publicare toate arhitecturile
publish-all: build-all
	@echo "Publishing all agent builds to backend..."
	@mkdir -p $(BACKEND_PUBLIC)
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(BACKEND_PUBLIC)/bittrail-agent-linux-amd64
	@cp $(BUILD_DIR)/$(BINARY_NAME)-linux-arm64 $(BACKEND_PUBLIC)/bittrail-agent-linux-arm64
	@cp $(BUILD_DIR)/$(BINARY_NAME) $(BACKEND_PUBLIC)/bittrail-agent
	@cp install.sh $(BACKEND_PUBLIC)/
	@cp update.sh $(BACKEND_PUBLIC)/ 2>/dev/null || true
	@cp uninstall.sh $(BACKEND_PUBLIC)/ 2>/dev/null || true
	@echo '{"version":"$(VERSION)","buildDate":"$(shell date -u +%Y-%m-%dT%H:%M:%SZ)","architectures":["linux-amd64","linux-arm64"]}' > $(BACKEND_PUBLIC)/agent-version.json
	@echo "Published: version $(VERSION) (amd64 + arm64)"

# Testare colectori
test:
	@go run ./cmd/agent test

# Rulare mod dev
run:
	@go run ./cmd/agent run

# Afiseaza help
help:
	@echo "BitTrail Agent - Build Targets"
	@echo ""
	@echo "  make              - Build pentru Linux x86_64 (default)"
	@echo "  make build-linux  - Build explicit pentru Linux x86_64"
	@echo "  make build-linux-arm64 - Build pentru Linux ARM64"
	@echo "  make build-all    - Build pentru toate platformele"
	@echo "  make publish      - Build si publica in backend (x86_64)"
	@echo "  make publish-all  - Build si publica toate arhitecturile"
	@echo "  make clean        - Sterge build directory"
	@echo "  make install      - Instaleaza local"
	@echo "  make test         - Testeaza colectorii"
	@echo ""
	@echo "Output: $(BUILD_DIR)/$(BINARY_NAME)"
	@echo "Version: $(VERSION)"
