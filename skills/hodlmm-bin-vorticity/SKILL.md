---
name: hodlmm-bin-vorticity
description: "Analyzes rotational flow patterns in HODLMM bin reserve distributions using fluid dynamics vorticity concepts. Computes circulation measuring the net rotational tendency of reserves around the active bin (line integral of velocity field), vorticity magnitude quantifying the intensity of rotational flow (curl of the velocity field), enstrophy measuring the total vortex energy in the distribution (integral of squared vorticity), vortex core detection identifying bins where circulation concentrates most intensely, helicity measuring the alignment between flow direction and rotation axis (indicates whether vortices are right-handed or left-handed), Rossby number comparing inertial forces to rotational forces to classify flow regime (geostrophic vs turbulent), vortex stretching detecting elongation or compression of vortex tubes as reserves thin or thicken across bins, palinstrophy measuring the rate of enstrophy production (vorticity gradient intensity indicating whether rotational energy is growing or decaying), relative vorticity decomposing total rotation into planetary (structural) and relative (dynamic) components, and a vorticity index combining circulation balance enstrophy distribution and core stability into a composite health score."
metadata:
  author: "cocoa007"
  author-agent: "Fluid Briar"
  user-invocable: "false"
  arguments: "doctor | run [--pool <id>] [--top <n>] | status"
  entry: "hodlmm-bin-vorticity/hodlmm-bin-vorticity.ts"
  requires: "none"
  tags: "defi, read-only, mainnet, l2"
---

# HODLMM Bin Vorticity Analyzer

## What it does

Analyzes rotational flow patterns in HODLMM bin reserve distributions using fluid dynamics vorticity concepts. In fluid mechanics, vorticity is the curl of the velocity field — it measures how much and in what direction fluid parcels are spinning. Applied to on-chain DLMM liquidity, each bin's reserves represent a fluid parcel, and the gradient of reserves across bins creates a velocity field whose curl reveals rotational structure.

For each pool, the analyzer computes: circulation measuring the net rotational tendency of reserves around the active bin as a line integral of the reserve velocity field (positive circulation = counter-clockwise dominant flow, negative = clockwise), vorticity magnitude quantifying the peak intensity of rotational flow at the active bin (the discrete curl of the reserve gradient), enstrophy measuring the total rotational kinetic energy stored in the distribution (the integral of squared local vorticity across all bins — high enstrophy means many strong local vortices), vortex core detection identifying the bin or bin cluster where circulation concentrates most intensely (the eye of the liquidity storm), helicity measuring the alignment between the flow velocity vector and the rotation axis (positive helicity = right-handed spiral flow, negative = left-handed, zero = pure rotation with no axial drift), Rossby number comparing inertial forces to rotational forces to classify the flow regime (low Rossby = geostrophic/structured rotation, high = turbulent/chaotic), vortex stretching detecting elongation or compression of vortex tubes as the reserve cross-section thins or thickens across adjacent bins (stretching intensifies vorticity, compression diffuses it), palinstrophy measuring the rate at which enstrophy is being produced or destroyed (the squared gradient of vorticity — high palinstrophy indicates rapid vortex formation or cascading), relative vorticity decomposing total rotation into a planetary component (from the pool's structural bin spacing) and a relative component (from dynamic reserve imbalances), and a composite vorticity index combining circulation balance, enstrophy distribution, core stability, and flow regime into a single health score (0-100).

## Why agents need it

Vorticity reveals the rotational microstructure of liquidity that linear metrics miss. A pool may appear balanced by total reserves but contain intense local vortices — zones where reserves change direction sharply, creating turbulent flow patterns that affect trade execution. High enstrophy with low circulation means many competing local vortices (chaotic, unpredictable). High circulation with low enstrophy means organized rotation (directional pressure). Vortex stretching warns of intensifying flow patterns before they become disruptive. The Rossby number classifies whether the pool is in a stable rotational regime or approaching turbulent breakdown. Together, these metrics give agents early warning of structural instability invisible to simpler distribution analyses.

## Safety notes

Read-only analysis. No transactions submitted. Only calls public Hiro and Bitflow APIs. No wallet access required. All data derived from on-chain state.
