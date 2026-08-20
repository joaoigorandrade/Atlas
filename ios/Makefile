# Everything ios/AGENTS.md tells you to run. `build` and `test` are the host
# gates and need no Xcode; `run` regenerates the project first because it isn't
# committed.

DEVICE ?= booted
APP := com.joaoigor.atlas

.PHONY: generate build test run open clean

## generate: write Atlas.xcworkspace from Project.swift and .env.local
generate:
	./generate.sh --no-open

## build: swift build (host, no Xcode) — the gate for a push
build:
	cd AtlasKit && swift build

## test: swift test (host, no simulator) — the other gate
test:
	cd AtlasKit && swift test

## run: build the app and launch it on the simulator (DEVICE=<udid> to pick one)
run: generate
	open -a Simulator
	xcrun simctl bootstatus $(DEVICE) -b
	xcodebuild -workspace Atlas.xcworkspace -scheme Atlas \
		-destination 'generic/platform=iOS Simulator' \
		-derivedDataPath .build/xcode build
	xcrun simctl install $(DEVICE) .build/xcode/Build/Products/Debug-iphonesimulator/Atlas.app
	xcrun simctl launch $(DEVICE) $(APP)

## open: generate, then open the workspace in Xcode
open:
	./generate.sh

## clean: drop everything generated
clean:
	rm -rf Atlas.xcodeproj Atlas.xcworkspace Derived .build AtlasKit/.build
