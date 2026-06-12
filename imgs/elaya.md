Elaya: Premium 3D Character Design Specification
This document translates Elaya's visual design into precise technical and aesthetic requirements to achieve a high-end, studio-quality 3D model.

Core Morphology and Scale
Total Length: The character measures approximately 50 centimeters from the top of the head to the resting tips of the tentacles.

Size Comparison: Elaya's overall length is roughly equivalent to the height of a toddler's skeleton from the pelvis to the top of the skull.

Base Form: The head is a prominent, bulbous, dome-like structure that seamlessly tapers into the tentacle base.

Layout: The creature features a primary frontal view displaying a main glowing sigil, two eyes, a mouth, and exactly five elemental ribbons (tentacles).

Anatomical Features & Geometry
Eyes: The eyes are large, deeply black, and highly reflective, providing a focal point for expressions.

Mouth: The default mouth is a tiny, simple, soft curve located perfectly centered beneath the eyes.

Forehead Sigil: A distinct, vertical, glowing diamond-shaped sigil rests directly in the center of the forehead.

Dorsal Fins: Two small, rounded fin-like structures sit symmetrically on the upper rear curve of the head.

Side Fins (Ears): Two larger, wing-like fins protrude from the lower sides of the head.

Fin Geometry: The side fins feature internal geometric structures, specifically spiral variations and concentric ring patterns.

Tentacle Count: Elaya possesses exactly five distinct, ribbon-like tentacles.

Material and Shader Guidelines (Blender Specifications)
To achieve a premium, ethereal, and soft studio aesthetic, the material setup requires a complex, layered shader approach.

Skin Property: The primary surface must utilize a translucent skin material to allow light to pass through softly.

Internal Illumination: The material must feature layered bioluminescence.

Cosmic Interior: The inside of the head volume contains a dense internal star cluster pattern, functioning as a particle field or volumetric nebula.

Core Body Color: The default head and upper body utilize a soft, pastel gradient transitioning from light blue to a warm, soft peach/pink.

Tentacle Gradient: The five elemental ribbons feature a vibrant, dynamic color gradient that flows from green on the outer left, to blue, purple, pink, orange, and finally yellow on the right.

Luminescent Details: Specific light patterns, such as the forehead sigil and smaller diamond-shaped dots scattered across the crown and back, require dedicated emission masks.

Surface Finish: The materials require specific material roughness tuning to maintain a soft, non-plastic, organic appearance.

Rigging and Animation Architecture
For fluid, high-fidelity animation, the skeletal rig must accommodate specific joint placements and movement flows.

Head/Body Joint: A primary connection joint dictates the overall orientation and tilt of the cranial structure.

Fin Joints: Each of the side fins (ears) requires an independent fin joint to allow for expressive fluttering and angling.

Tentacle Base: A primary tentacle base joint controls the collective expansion, contraction, and directional sweep of the ribbons.

Ribbon Articulation: Each of the five individual tentacles requires a spline or chain rig featuring at least five inter-tentacle joints per ribbon to achieve smooth, wave-like motion.

Motion Flow: The rig must support an "Overall Muscle Flow" that allows for seamless transitions between a streamlined swim state and a defensive recoil state.

Hover Mechanics: The base idle animation must include a gentle hover and tilt cycle, utilizing self-correcting drift mechanics.

Pulsation: The animation must incorporate an internal glow and pulsation cycle, shifting smoothly from dim to medium to bright.

Emotional States and Blendshapes
Elaya's face and body must be rigged with highly responsive shape keys (blendshapes) and material toggles to transition through various emotional states.

Curious: Requires a distinct head tilt and wide eyes for focus.

Happy: The mouth opens slightly, and the eyes transition into a squinted, curved upward shape.

Gentle Joy: Features a soft smile and gentle, flowing tentacle positioning.

Elated Dance: Requires swirling tentacle flow and intensified bioluminescence.

Maximum Excitement: The bioluminescence density receives a 150% boost, the mouth forms a wide 'V' shape, brows appear raised, and the tentacles perform a radial splay with high tension.

Calm: The eyes are completely closed with a gentle, serene smile.

Thinking: One tentacle curls upward to touch the mouth area.

Sadness: Tentacles droop and retract, overall colors become dull and muted, brows point downward, and glowing tears are emitted from the eyes.

Tensed/Anxious: The brow area elevates aggressively, the mouth forms a tight, straight horizontal line, the skin adopts a hardened appearance, and the internal light pulses erratically.

Dormant (Power-Down State): The body colors mute entirely to dark greys and browns, the eyes close, and internal emission drops to a baseline of 10%.
