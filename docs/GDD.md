# GAME DESIGN DOCUMENT (GDD) - HORROR GAME SCENARIO

## 1. SYSTEM PROMPT & STYLISTIC DIRECTIVES
*   **Aesthetic:** Photorealistic UE5 style, dynamic volumetric lighting, micro-dust particles, wet surface reflections.
*   **Atmosphere:** Psychological horror, slow-burn tension, oppressive silence (Inspiration: *Visage*, *P.T.*).
*   **Player Goal:** Reconstruct a tragic family puzzle to unlock the exit door.

---

## 2. CORE SYSTEM: DYNAMIC PARANORMAL EVENTS (RNG & STRESS)
Track a hidden variable: `Player_Stress` (0 to 100).
Increase `Player_Stress` based on: Time spent in dark, facing walls, failed puzzles.

### [IF Player_Stress < 30] -> Low-Tier Events (RNG: 10% chance every 30s)
*   Audio: Distant floorboard creaking, faint female sigh.
*   Visual: Lightbulbs flickering, a door slightly ajar when the player turns around.

### [IF 30 <= Player_Stress < 70] -> Mid-Tier Events (RNG: 20% chance every 30s)
*   Audio: Child weeping behind walls, footsteps mimicking the player with a 1-second delay.
*   Visual: Manifestation of a fleeting shadow at the end of a corridor.

### [IF Player_Stress >= 70] -> High-Tier Events (RNG: 35% chance every 20s)
*   Visual: Bleeding walls, static TVs turning on at max volume.
*   Physics: Doors violently slamming shut in front of the player.

---

## 3. SCRIPTED JUMPSCARES (HIGH IMPULSE / AUDIO-VISUAL SHOCKS)

### Jumpscare_01: "The Mirror Reflection"
*   **Trigger Condition:** `Player_HasKey_Basement == True` AND `Player_Enters_MainCorridor`.
*   **Sequence:**
    1. Player passes a large wall mirror.
    2. Player's reflection stops walking, turns to face the player, and slits its own throat.
    3. Simultaneous 3D Binaural audio scream directly behind the player's real position.

### Jumpscare_02: "The Cradle"
*   **Trigger Condition:** `Player_Interacts_With_Cradle` in the Nursery.
*   **Sequence:**
    1. A vintage music box starts playing backward on approach.
    2. When the player looks into the cradle: A disfigured entity bursts upward at lightning speed toward the camera.
    3. Screen glitch effect (0.5s visual static + high-frequency audio blast).

### Jumpscare_03: "Kitchen Collapse"
*   **Trigger Condition:** `Player_PicksUp_Fuse` in the kitchen.
*   **Sequence:**
    1. Complete audio dropout (absolute silence for 2 seconds).
    2. *All* cabinet doors and drawers violently blast open simultaneously.
    3. Plates smash on the floor while a hanging corpse drops from the ceiling right in front of the camera, then vanishes instantly in the dark.

---

## 4. NARRATIVE PROGRESSION & LEVEL DESIGN FLOW
*   **Act I: Exploration & Gaslighting.** The house feels normal but "wrong". Items change places when out of sight. Key item to find: Family Photo Album.
*   **Act II: Spatial Distortion.** The house geometry breaks. A linear corridor becomes an infinite looping hallway that narrows down after each loop.
*   **Act III: The Hunt.** The basement floods. The Entity (The Mother) actively roams and hunts the player. Player must burn 3 cursed items to unlock the final exit.
