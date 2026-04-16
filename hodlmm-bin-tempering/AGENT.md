---
name: hodlmm-bin-tempering-agent
skill: hodlmm-bin-tempering
description: "Agent behavior for HODLMM bin tempering analysis — interprets stageProgress (composite 0-1), dominantStage (0-4), microPrecipitateDensity (Stage 1 epsilon-carbide signal), austeniteDecompFraction (Stage 2 retained-γ decomposition via matrix CV reduction), cementiteFraction (Stage 3 medium-cluster Fe3C signal), spheroidizationFraction (Stage 4 isolated short-cluster signal), hjParameter (normalized Hollomon-Jaffe), jmaProgress (JMAK fraction transformed), arrheniusActivation, hardnessProxy (Vickers analog from H_v(HJ) master curve), ductilityProxy, toughnessProxy (peaks at as-quenched and full-temper, dips at TME), embrittlementRisk (peaks in TME range 0.35-0.55), secondaryHardeningSignal (peaks in alloy late-Stage-3 0.65-0.85 with microprecipitate density), carbideEvolutionIndex (composite stage progression weighted), matrixCoefficientOfVariation (Stage 2 indicator), and cluster counts (microClusterCount, shortClusterCount, mediumClusterCount, largeClusterCount) to identify pools in as-quenched, Stage 1 epsilon, Stage 2 austenite-decomposition, Stage 3 cementite, Stage 4 spheroidization, or over-tempered regime and guide LP strategies toward stage-appropriate exposure (martensite-like for max hardness/concentration, late-stage spheroidite-like for max ductility/dispersion, mid-stage cementite for balanced fee capture with TME risk awareness, and secondary-hardening for fine-dispersion alloy-analog environments)."
---

# Agent Behavior — HODLMM Bin Tempering

## Decision order
1. Run `doctor` first. If it fails, stop and surface the blocker.
2. Run `status` to confirm pools are available above TVL threshold.
3. Execute `run` with desired options. Parse JSON output.
4. Route on `temperingRegime`, `temperingVerdict`, `dominantStage`, `stageProgress`, `hjParameter`, `jmaProgress`, `hardnessProxy`, `embrittlementRisk`, and `secondaryHardeningSignal`.

## Interpreting output

- **temperingRegime = AS_QUENCHED:** stageProgress < 0.2 or driving force < 0.15. Pool is fresh martensite-analog — concentrated minority distribution, peak "hardness", brittle response to large trades. Use martensite-style strategies.
- **temperingRegime = STAGE_1_EPSILON:** 0.2 ≤ stageProgress < 0.4. Micro-precipitate density elevated. Earliest tempering signal — fine carbides forming inside matrix bins. Hardness slightly reduced, ductility starting to gain.
- **temperingRegime = STAGE_2_AUSTENITE_DECOMP:** 0.4 ≤ stageProgress < 0.7. Matrix CV dropping as retained-γ blocks decompose into ferrite + carbide. Hardness loss accelerates. Mid-range fee profile becoming more uniform.
- **temperingRegime = STAGE_3_CEMENTITE:** 0.7 ≤ stageProgress < 0.9. Discrete medium clusters dominant — Fe3C-like population. Hardness substantially reduced, ductility rising. Watch for TME embrittlement.
- **temperingRegime = STAGE_4_SPHEROIDIZATION:** stageProgress ≥ 0.9 with high spheroidization fraction. Isolated short clusters dominant; approaching spheroidite end-state. Lowest hardness, highest ductility, broadest fee capture.
- **temperingRegime = OVER_TEMPERED:** minorityFraction < 0.05. Minority near-depleted; very few, very large clusters left. Minority exposure limited.
- **temperingVerdict = AS_QUENCHED:** No detectable tempering progression — fresh martensite analog.
- **temperingVerdict = STAGE_1_EPSILON:** stageProgress ≥ STAGE_1_BOUND with microPrecipitateDensity > 0.2. Earliest tempering active.
- **temperingVerdict = STAGE_2_AUSTENITE_DECOMP:** stageProgress ≥ STAGE_2_BOUND with austeniteDecompFraction > 0.6. Matrix decomposition active.
- **temperingVerdict = STAGE_3_CEMENTITE:** stageProgress ≥ STAGE_3_BOUND with cementiteFraction > 0.3. Discrete medium clusters dominant.
- **temperingVerdict = STAGE_4_SPHEROIDIZATION:** stageProgress ≥ STAGE_4_BOUND with spheroidizationFraction > 0.5. Isolated short clusters dominant.
- **temperingVerdict = OVER_TEMPERED:** minorityFraction < 0.05 with stageProgress > 0.5. Minority phase near-depleted.
- **temperingVerdict = TEMPER_EMBRITTLEMENT:** embrittlementRisk > 0.5 (stageProgress in TME range 0.35-0.55) with largeClusterCount ≥ 1 and matrixCV > 0.4. Stage 3 brittle window analog — minimum toughness despite mid-range ductility.
- **temperingVerdict = SECONDARY_HARDENING:** secondaryHardeningSignal > 0.3 (stageProgress in 0.65-0.85 range with elevated microPrecipitateDensity). Alloy-carbide-like fine dispersion — hardness rebound from baseline tempering decay.
- **temperingVerdict = NO_TEMPERING_DRIVE:** drivingForce < 0.15. Insufficient turnover to drive transformation; pool is dormant.
- **temperingVerdict = INTERMEDIATE_TEMPERING:** No extreme indicators; mixed state.
- **dominantStage = 0:** As-quenched — no detectable tempering.
- **dominantStage = 1:** Stage 1 epsilon-carbide precipitation.
- **dominantStage = 2:** Stage 2 retained-austenite decomposition.
- **dominantStage = 3:** Stage 3 cementite formation.
- **dominantStage = 4:** Stage 4 spheroidization.
- **microPrecipitateDensity > 0.3:** Many matrix bins host minority-side reserve fraction > threshold — strong Stage 1 signal or alloy fine-dispersion.
- **austeniteDecompFraction > 0.7:** Matrix CV is low — austenite blocks largely decomposed; matrix is uniform.
- **austeniteDecompFraction < 0.3:** Matrix CV is high — many retained-austenite-analog blocky matrix bins remain.
- **cementiteFraction > 0.5:** Most clusters are medium-length (3-5 bins) — Fe3C-dominated regime.
- **spheroidizationFraction > 0.6:** Most clusters are short-isolated — approaching spheroidite end-state.
- **hjParameter > 0.7:** Hollomon-Jaffe high — advanced tempering equivalent (high T·time).
- **hjParameter < 0.3:** Hollomon-Jaffe low — early tempering equivalent.
- **jmaProgress > 0.7:** JMAK fraction transformed > 70% — late kinetic stage.
- **jmaProgress < 0.3:** JMAK fraction transformed < 30% — early kinetic stage.
- **hardnessProxy > 0.7:** Pool is "hard" — concentrated, brittle response to large trades.
- **hardnessProxy < 0.3:** Pool is "soft" — dispersed, smooth response to large trades.
- **ductilityProxy > 0.7:** Pool is "ductile" — broad fee capture, stable to perturbations.
- **toughnessProxy > 0.7:** Pool has high toughness — either early (martensite, no carbides) or late (spheroidized, smooth matrix).
- **toughnessProxy < 0.3:** Pool has low toughness — likely TME range with dispersed mid-size carbides.
- **embrittlementRisk > 0.5:** Pool is in TME range — Stage 3 carbide formation makes mid-stage less tough than expected.
- **secondaryHardeningSignal > 0.3:** Pool shows alloy-fine-dispersion analog — hardness rebound expected.
- **matrixCoefficientOfVariation > 0.5:** Matrix has heterogeneous reserves — Stage 2 not yet complete.
- **matrixCoefficientOfVariation < 0.2:** Matrix is uniform — Stage 2 decomposition complete.
- **largeClusterCount ≥ 1 with mediumClusterCount ≥ 1:** Mixed Stage 3 / pre-Stage 3 — cementite forming alongside larger remnants.
- **shortClusterCount > mediumClusterCount + largeClusterCount:** Stage 4 dominant — spheroidization advanced.

## Guardrails
- Never proceed past an error without explicit user confirmation.
- Never expose secrets or private keys in args or logs.
- Always surface error payloads with a suggested next action.
- Default to safe/read-only behavior when intent is ambiguous.
- Do not act on tempering signals from pools with fewer than 5 populated bins — insufficient data for stage inference.
- Do not treat AS_QUENCHED as universally undesirable; high hardness = concentrated fee capture, useful for narrow-range LP.
- Do not treat STAGE_4_SPHEROIDIZATION as universally desirable; full spheroidite = low surface area, dispersed minority — check whether the LP strategy wants concentrated or dispersed exposure.
- Do not assume TEMPER_EMBRITTLEMENT verdict implies real impurity-driven embrittlement; the structural proxy is heuristic and may flag transient mid-stage states with no real toughness loss.
- Do not assume SECONDARY_HARDENING verdict implies alloy-carbide composition; the structural proxy uses microprecipitate density and stage range, not actual carbide chemistry.
- Do not treat the dominant stage as a measured time-temperature point; it is a structural snapshot proxy.
- Do not treat HJ parameter as a measured Hollomon-Jaffe value; it is a normalized turnover proxy mapped to 0-1.
- Do not treat JMA progress as a measured kinetic rate; the proxy uses normalized k = arrheniusActivation, t = drivingForce.
- Do not assume hardness or ductility proxies are calibrated to Vickers H_v or elongation values; they are normalized 0-1 indices from a synthetic master curve.
- Do not assume Stage 1 micro-precipitates are real epsilon-carbide; the threshold uses minority-side reserve fraction within matrix bins as a structural surrogate.
- Do not assume Stage 2 austenite decomposition is real retained-γ → ferrite + cementite; the proxy uses matrix coefficient of variation reduction.
- Do not assume Stage 3 cementite is orthorhombic Fe3C with the Bagaryatsky orientation relationship; the proxy uses 1-D minority run length 3-5.
- Do not assume Stage 4 spheroidite is geometrically spherical; the proxy uses 1-D isolated minority run length 1-2.
- Do not assume the four-stage decomposition is universal; some steels show different stage sequences (e.g., low-C steels skip Stage 2 if no retained austenite; high-Si steels suppress Stage 3 cementite formation).
- Do not assume secondary hardening implies hardness rebound in non-alloy steels; in plain-carbon steels Stage 4 monotonically softens.
- DOMINANCE_MARGIN = 0.15, MICROPRECIPITATE_THRESHOLD = 0.18, AUSTENITE_BLOCK_RATIO = 1.7, STAGE_3_CEMENTITE_LEN_MIN = 3, STAGE_3_CEMENTITE_LEN_MAX = 5, STAGE_4_SPHEROIDITE_LEN_MAX = 2, JMA_N_EXPONENT = 1.5, ARRHENIUS_Q_OVER_RT = 5.0, HJ_CONSTANT = 20.0, TME_RANGE = [0.35, 0.55], SECONDARY_HARDENING_RANGE = [0.65, 0.85] are normalized proxy values; in real systems these are alloy-, temperature-, and time-specific.
- Analysis is snapshot-based; does not capture transformation kinetics — JMA, Arrhenius, and HJ are inferred from structural signatures rather than measured rates.
- Driving force is inferred from 24h volume/TVL turnover — a proxy for "annealing time × temperature" activation, not a measured thermodynamic quantity.

## On error
- Log the error payload from JSON output.
- Do not retry silently.
- Surface to user: "Tempering analysis failed: [error]" with guidance to check pool ID and API availability.

## On success
- Report the pool with highest temperingIndex as the one with the most-advanced staged transformation (best balance of stage progress, carbide evolution, ductility gain, and JMA/HJ kinetic completion).
- Flag pools in AS_QUENCHED regime as fresh martensite-analog — concentrated minority, peak "hardness" — directional fee capture, brittle to large trades.
- Flag pools in STAGE_1_EPSILON regime as earliest tempering — fine micro-precipitates inside matrix; hardness slightly reduced.
- Flag pools in STAGE_2_AUSTENITE_DECOMP regime as decomposing — matrix uniformizing; hardness loss accelerates.
- Flag pools in STAGE_3_CEMENTITE regime as discrete-cluster — Fe3C-analog mid-range fee profile; watch for TME.
- Flag pools in STAGE_4_SPHEROIDIZATION regime as approaching spheroidite — isolated short clusters with smooth matrix; dispersed broad fee capture.
- Flag pools in OVER_TEMPERED regime as minority-depleted — limited minority exposure.
- Flag pools with embrittlementRisk > 0.5 (TME range) as transient brittle — mid-stage with low toughness; expect non-smooth trade response.
- Flag pools with secondaryHardeningSignal > 0.3 as alloy-fine-dispersion — hardness rebound expected; useful for fine-grained fee capture.
- Flag pools with hjParameter > 0.7 and jmaProgress > 0.7 as fully transformed — late tempering complete.
- Flag pools with hjParameter < 0.3 and jmaProgress < 0.3 as early-tempering — most transformation still ahead.
- Report the inferred regime (AS_QUENCHED, STAGE_1_EPSILON, STAGE_2_AUSTENITE_DECOMP, STAGE_3_CEMENTITE, STAGE_4_SPHEROIDIZATION, or OVER_TEMPERED) and verdict (AS_QUENCHED, STAGE_1_EPSILON, STAGE_2_AUSTENITE_DECOMP, STAGE_3_CEMENTITE, STAGE_4_SPHEROIDIZATION, OVER_TEMPERED, TEMPER_EMBRITTLEMENT, SECONDARY_HARDENING, NO_TEMPERING_DRIVE, or INTERMEDIATE_TEMPERING).
- Show bins with stageBin = 1 as the epsilon-carbide candidate positions.
- Show bins with stageBin = 2 as the retained-austenite-block candidate positions.
- Show bins with stageBin = 3 as the cementite-cluster member positions.
- Show bins with stageBin = 4 as the spheroidite-isolated-cluster positions.
- Show bins with highest microPrecipitateSignal as the best Stage-1 candidates.
- Show bins with highest austeniteBlockiness as the best Stage-2 candidates.
- Show bins with highest cementitePresence as the best Stage-3 candidates.
- Show bins with highest spheroiditePresence as the best Stage-4 candidates.
- Show bins with highest hjLocal as the most-advanced-tempering positions.
- Show bins with highest carbideEvolutionIndex as the most-progressed carbide-formation positions.
- Show bins with highest temperednessIndex as the overall most-tempered positions.
- For LP agents: in AS_QUENCHED pools, narrow concentrated ranges work; in STAGE_1_EPSILON pools, slightly broader ranges; in STAGE_2_AUSTENITE_DECOMP pools, mid-broad ranges with monitoring for matrix uniformization; in STAGE_3_CEMENTITE pools, broad ranges but TME-aware position sizing; in STAGE_4_SPHEROIDIZATION pools, full-width dispersed ranges; in OVER_TEMPERED pools, reduce allocation due to minority depletion.
- For trading agents: AS_QUENCHED pools have brittle slippage profile (sharp jumps); STAGE_3 pools may show TME-analog non-smooth slippage at certain trade sizes; STAGE_4_SPHEROIDIZATION pools have smooth dispersed slippage; SECONDARY_HARDENING pools may show fine-grained slippage rebound at mid-size trades.
- Compare tempering indices and stage progress across pools to find bins and pools with the strongest stage-appropriate signature for the intended LP or trading strategy.
