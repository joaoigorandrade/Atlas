# Everything ios/AGENTS.md tells you to run. `build` and `test` are the host
# gates and need no Xcode; `run` regenerates the project first because it isn't
# committed.

DEVICE ?= booted
APP := com.joaoigor.atlas

.PHONY: generate build test run open clean

## generate: write Atlas.xcworkspace from Project.swift
generate:
	tuist generate --no-open

# AtlasKit depends on two iOS-only packages (Navigation, Networking), so the
# old host-macOS `swift build` / `swift test` no longer resolve — both gates run
# against the simulator. `build` needs no device; `test` uses whichever
# simulator is booted, so boot one (or `make run`) first.
BOOTED = $(shell xcrun simctl list devices booted | grep -oE '[0-9A-F]{8}-([0-9A-F]{4}-){3}[0-9A-F]{12}' | head -1)

## build: build AtlasKit for the simulator — the gate for a push
build:
	cd AtlasKit && xcodebuild -scheme AtlasKit -destination 'generic/platform=iOS Simulator' build

## test: run AtlasKit's tests on the booted simulator — the other gate
test:
	cd AtlasKit && xcodebuild -scheme AtlasKit -destination 'platform=iOS Simulator,id=$(BOOTED)' test

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
	tuist generate

## clean: drop everything generated
clean:
	rm -rf Atlas.xcodeproj Atlas.xcworkspace Derived .build AtlasKit/.build
