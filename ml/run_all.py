"""
PRIVISEE-X ML Pipeline Orchestrator
Runs the complete ML pipeline end-to-end with one command.

Usage:
  cd d:\\Privisee-x
  python ml/run_all.py

Steps:
  1. Install dependencies
  2. Build dataset from public sources
  3. Train Random Forest classifier
  4. Train Isolation Forest anomaly detector
  5. Evaluate both models
  6. Convert RF to browser-ready JSON
  7. Push updated models to Git
"""

import os
import sys
import time
import subprocess

# Ensure we run from the ml/ directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(SCRIPT_DIR)

STEPS = [
    ("Build Dataset",              "build_dataset.py"),
    ("Train Random Forest",        "train_random_forest.py"),
    ("Train Isolation Forest",     "train_isolation_forest.py"),
    ("Evaluate Models",            "evaluate_models.py"),
    ("Convert to Browser JSON",    "convert_to_tfjs.py"),
]


def run_step(name: str, script: str) -> bool:
    print(f"\n{'='*60}")
    print(f"  STEP: {name}")
    print(f"{'='*60}")
    t0 = time.time()
    result = subprocess.run(
        [sys.executable, script],
        capture_output=False,
    )
    elapsed = time.time() - t0
    if result.returncode == 0:
        print(f"\n  ✓ {name} completed in {elapsed:.1f}s")
        return True
    else:
        print(f"\n  ✗ {name} FAILED (exit code {result.returncode})")
        return False


def check_dataset_exists() -> bool:
    return os.path.exists("dataset_trackers.csv")


def print_summary(results: dict):
    print("\n" + "=" * 60)
    print("  PIPELINE SUMMARY")
    print("=" * 60)
    all_ok = True
    for step, ok in results.items():
        status = "✓ PASS" if ok else "✗ FAIL"
        print(f"  {status}  {step}")
        if not ok:
            all_ok = False

    print("=" * 60)
    if all_ok:
        print("\n✓ All steps completed successfully!")
        print("\nModel files are ready in: ../models/")
        print("The extension will load them from: src/models/")
        print("\nTo copy models to extension:")
        print("  xcopy /E /Y ..\\models\\tracker_classifier ..\\src\\models\\tracker_classifier\\")
    else:
        print("\n⚠ Some steps failed. Check output above.")
    print("=" * 60)


if __name__ == "__main__":
    print("=" * 60)
    print("  PRIVISEE-X ML Pipeline")
    print("  Running all training steps...")
    print("=" * 60)

    results = {}

    for step_name, script in STEPS:
        # Skip dataset build if CSV already exists and user passes --skip-dataset
        if script == "build_dataset.py" and "--skip-dataset" in sys.argv:
            if check_dataset_exists():
                print(f"\n  Skipping dataset build (--skip-dataset flag, CSV exists)")
                results[step_name] = True
                continue

        ok = run_step(step_name, script)
        results[step_name] = ok

        # Stop pipeline on critical failures
        if not ok and script in ("build_dataset.py", "train_random_forest.py"):
            print(f"\n  Critical step failed. Stopping pipeline.")
            break

    print_summary(results)
