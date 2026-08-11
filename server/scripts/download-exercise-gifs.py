#!/usr/bin/env python3
"""
Downloads exercise demonstration GIFs from the hasaneyldrm/exercises-dataset
GitHub repo (non-commercial license, fine for this personal local app) into
client/public/exercises/ so the app works without depending on a live CDN.

Run: python3 server/scripts/download-exercise-gifs.py
"""
import os
import urllib.request

BASE = "https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/"
OUT_DIR = os.path.join(os.path.dirname(__file__), "../../client/public/exercises")

# exercise name (matches server/db/index.js seed) -> (remote gif path, local slug)
MAPPING = {
    "Back Squat":                "videos/0043-qXTaZnJ.gif",
    "Bench Press":                "videos/0025-EIeI8Vf.gif",
    "Close-Grip Bench Press":     "videos/0030-J6Dx1Mu.gif",
    "Deadlift":                   "videos/0032-ila4NZS.gif",
    "Romanian Deadlift":          "videos/0085-wQ2c4XD.gif",
    "Overhead Press":             "videos/0091-kTbSH9h.gif",
    "Good Morning":               "videos/0044-XlZ4lAC.gif",
    "Bent-Over Barbell Row":      "videos/0027-eZyBC3j.gif",
    "Barbell Curl":               "videos/0031-25GPyDY.gif",
    "Barbell Lunge":              "videos/0054-t8iSghb.gif",
    "Barbell Shrug":              "videos/0095-dG7tG5y.gif",
    "Power Clean":                "videos/0648-SiWCcTN.gif",
    "Front Squat":                "videos/0042-zG0zs85.gif",
    "Zercher Squat":              "videos/0127-LSTChY9.gif",
    "Barbell Hip Thrust":         "videos/1409-qKBpF7I.gif",
    "Dumbbell Bench Press":       "videos/0289-SpYC0Kp.gif",
    "Incline Dumbbell Press":     "videos/0314-ns0SIbU.gif",
    "Dumbbell Fly":               "videos/0308-yz9nUhF.gif",
    "Dumbbell Lateral Raise":     "videos/0334-DsgkuIt.gif",
    "Dumbbell Front Raise":       "videos/0310-3eGE2JC.gif",
    "Dumbbell Rear Delt Fly":     "videos/2292-mu5Guxt.gif",
    "Dumbbell Curl":              "videos/0294-NbVPDMW.gif",
    "Hammer Curl":                "videos/0313-slDvUAU.gif",
    "Dumbbell Shoulder Press":    "videos/0405-znQUdHY.gif",
    "Dumbbell Romanian Deadlift": "videos/1459-rR0LJzx.gif",
    "Dumbbell Lunge":             "videos/0336-RRWFUcw.gif",
    "Goblet Squat":               "videos/1760-yn8yg1r.gif",
    "Dumbbell Tricep Kickback":   "videos/1739-Gi2BXfK.gif",
    "Dumbbell Pullover":          "videos/0375-9XjtHvS.gif",
    "Dumbbell Step-Up":           "videos/0431-aXtJhlg.gif",
    "Dumbbell Shrug":             "videos/0406-NJzBsGJ.gif",
    "Single-Arm Dumbbell Row":    "videos/0292-C0MA9bC.gif",
    "Kettlebell Swing":           "videos/0549-UHJlbu3.gif",
    "Kettlebell Goblet Squat":    "videos/0534-ZA8b5hc.gif",
    "Kettlebell Turkish Get-Up":  "videos/0551-Ha7SZ3y.gif",
    "Lat Pulldown (Wide Grip)":   "videos/2330-LEprlgG.gif",
    "Lat Pulldown (Close Grip)":  "videos/0818-rkg41Fb.gif",
    "Seated Cable Row":           "videos/0861-fUBheHs.gif",
    "Cable Tricep Pushdown":      "videos/0241-gAwDzB3.gif",
    "Straight-Arm Pulldown":      "videos/0238-x69MAlq.gif",
    "Cable Fly":                  "videos/0179-FVmZVhk.gif",
    "Pull-Up":                    "videos/0652-lBDjFxJ.gif",
    "Chin-Up":                    "videos/1326-T2mxWqc.gif",
    "Push-Up":                    "videos/0662-I4hDWkc.gif",
    "Dip":                        "videos/0814-X6C6i5Y.gif",
    "Inverted Row":               "videos/0499-bZGHsAZ.gif",
    "Dead Bug":                   "videos/0276-iny3m5y.gif",
    "Hanging Leg Raise":          "videos/0472-I3tsCnC.gif",
    "Hanging Knee Raise":         "videos/1764-VEcJRo2.gif",
    "Mountain Climbers":          "videos/0630-RJgzwny.gif",
    "Burpees":                    "videos/1160-dK9394r.gif",
    "Box Jump":                   "videos/1374-iPm26QU.gif",
    "Side Plank":                 "videos/1775-VO2qeJg.gif",
    "Face Pull":                  "videos/0233-ZfyAGhK.gif",
}


def slugify(name: str) -> str:
    cleaned = name.lower().replace("(", "").replace(")", "").replace("-", " ").replace("/", " ")
    return "-".join(cleaned.split())


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ok, failed = [], []
    for name, remote_path in MAPPING.items():
        slug = slugify(name)
        local_path = os.path.join(OUT_DIR, f"{slug}.gif")
        url = BASE + remote_path
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = resp.read()
            with open(local_path, "wb") as f:
                f.write(data)
            ok.append((name, slug, len(data)))
            print(f"OK   {name:35s} -> exercises/{slug}.gif ({len(data)//1024}KB)")
        except Exception as e:
            failed.append((name, str(e)))
            print(f"FAIL {name:35s} -> {e}")

    print(f"\n{len(ok)} downloaded, {len(failed)} failed")
    total_kb = sum(sz for _, _, sz in ok) // 1024
    print(f"Total size: {total_kb}KB")
    if failed:
        print("Failed:", [n for n, _ in failed])


if __name__ == "__main__":
    main()
