# BitTrail Agent - Makefile

BINARY_NAME=bittrail-agent
VERSION=1.0.0
BUILD_DIR=build

# Default target OS/ARCH (x86_64 Linux)
GOOS=linux
GOARCH=amd64

.PHONY: all build build-linux build-all clean install test

# Build pentru x86_64 Linux (default)
all: build

build:
	@echo "Building $(BINARY_NAME) for $(GOOS)/$(GOARCH)..."
	@mkdir -p $(BUILD_DIR)
	GOOS=$(GOOS) GOARCH=$(GOARCH) CGO_ENABLED=0 go build \
		-ldflags="-s -w -X main.agentVersion=$(VERSION)" \
		-o $(BUILD_DIR)/$(BINARY_NAME) \
		./cmd/agent
	@echo "Built: $(BUILD_DIR)/$(BINARY_NAME)"

# Build explicit pentru Linux x86_64
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

# Install local (doar pentru development pe macOS/Linux)
install: build
	@sudo cp $(BUILD_DIR)/$(BINARY_NAME) /usr/local/bin/
	@sudo chmod +x /usr/local/bin/$(BINARY_NAME)
	@echo "Installed to /usr/local/bin/$(BINARY_NAME)"

# Test colectorii
test:
	@go run ./cmd/agent test

# Run development
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
	@echo "  make clean        - Sterge build directory"
	@echo "  make install      - Instaleaza local"
	@echo "  make test         - Testeaza colectorii"
	@echo ""
	@echo "Output: $(BUILD_DIR)/$(BINARY_NAME)"
