// Starter exercise library. Pure data, loaded on demand by the owner; existing
// exercises (matched by name or alias, case-insensitive) are never modified.

import type { MuscleGroup } from "@/lib/training-analytics";
import { ASSISTED_EQUIPMENT } from "@/lib/progression-type";

export interface StarterExercise {
  name: string;
  aliases?: string[];
  primary: MuscleGroup;
  secondary?: MuscleGroup[];
  equipment: string;
  pattern: "Push" | "Pull" | "Squat" | "Hinge" | "Lunge" | "Carry" | "Core" | "Isolation" | "Cardio";
  instructions: string;
  tips?: string;
}

export const STARTER_EXERCISES: StarterExercise[] = [
  { name: "Barbell Bench Press", aliases: ["Bench Press", "Flat Bench"], primary: "Chest", secondary: ["Triceps", "Shoulders"], equipment: "Barbell", pattern: "Push", instructions: "Lie on a flat bench, grip just wider than shoulders, lower the bar to mid-chest under control and press back up.", tips: "Keep shoulder blades pinned back and feet planted." },
  { name: "Incline Dumbbell Press", aliases: ["Incline DB Press"], primary: "Chest", secondary: ["Shoulders", "Triceps"], equipment: "Dumbbell", pattern: "Push", instructions: "Set the bench to 30–45°, press the dumbbells up and slightly together, lower to a deep chest stretch." },
  { name: "Chest Press (Machine)", aliases: ["Chest Press", "Machine Chest Press"], primary: "Chest", secondary: ["Triceps"], equipment: "Machine", pattern: "Push", instructions: "Adjust the seat so handles line up with mid-chest, press forward without locking out hard." },
  { name: "Pec Fly (Machine)", aliases: ["Pec Fly", "Pec Deck", "Chest Fly (Machine)"], primary: "Chest", equipment: "Machine", pattern: "Isolation", instructions: "Bring the handles together in a wide arc, squeeze the chest, return slowly to a comfortable stretch." },
  { name: "Cable Fly", aliases: ["Cable Crossover"], primary: "Chest", equipment: "Cable", pattern: "Isolation", instructions: "With a slight elbow bend, sweep the handles together in front of the chest and return under control." },
  { name: "Push-Up", aliases: ["Press Up"], primary: "Chest", secondary: ["Triceps", "Shoulders"], equipment: "Bodyweight", pattern: "Push", instructions: "Keep a straight line from head to heels, lower the chest to the floor and press back up." },
  { name: "Overhead Press", aliases: ["Shoulder Press", "OHP", "Military Press"], primary: "Shoulders", secondary: ["Triceps"], equipment: "Barbell", pattern: "Push", instructions: "Press the bar from the collarbone to overhead, squeezing glutes and keeping ribs down." },
  { name: "Dumbbell Shoulder Press", aliases: ["DB Shoulder Press"], primary: "Shoulders", secondary: ["Triceps"], equipment: "Dumbbell", pattern: "Push", instructions: "Press dumbbells overhead from shoulder height, lowering until upper arms are about parallel to the floor." },
  { name: "Lateral Raise", aliases: ["Side Raise"], primary: "Shoulders", equipment: "Dumbbell", pattern: "Isolation", instructions: "Raise the dumbbells out to the sides to shoulder height with a soft elbow bend, lower slowly.", tips: "Lead with the elbows and avoid swinging." },
  { name: "Face Pull", primary: "Shoulders", secondary: ["Back"], equipment: "Cable", pattern: "Pull", instructions: "Pull the rope towards the face, elbows high, separating the hands at the end." },
  { name: "Deadlift", aliases: ["Conventional Deadlift"], primary: "Back", secondary: ["Hamstrings", "Glutes & Hips"], equipment: "Barbell", pattern: "Hinge", instructions: "Hinge at the hips, keep the bar close and back neutral, drive the floor away and lock out with the glutes." },
  { name: "Lat Pulldown", aliases: ["Lat Pull Down", "Pulldown"], primary: "Back", secondary: ["Biceps"], equipment: "Cable", pattern: "Pull", instructions: "Pull the bar to the upper chest by driving the elbows down, control the return to a full stretch." },
  { name: "Pull-Up", primary: "Back", secondary: ["Biceps"], equipment: "Bodyweight", pattern: "Pull", instructions: "From a dead hang, pull the chest towards the bar and lower under control." },
  { name: "Seated Cable Row", aliases: ["Cable Row", "Seated Row", "Low Row"], primary: "Back", secondary: ["Biceps"], equipment: "Cable", pattern: "Pull", instructions: "Sit tall, pull the handle to the lower ribs, squeeze the shoulder blades and return slowly." },
  { name: "Barbell Row", aliases: ["Bent-Over Row"], primary: "Back", secondary: ["Biceps"], equipment: "Barbell", pattern: "Pull", instructions: "Hinge to about 45°, pull the bar to the lower ribs keeping the back flat." },
  { name: "Dumbbell Row", aliases: ["One-Arm Row", "Single-Arm Row"], primary: "Back", secondary: ["Biceps"], equipment: "Dumbbell", pattern: "Pull", instructions: "Brace on a bench, pull the dumbbell to the hip and lower to a full stretch." },
  { name: "Back Squat", aliases: ["Squat", "Barbell Squat"], primary: "Quads", secondary: ["Glutes & Hips", "Hamstrings"], equipment: "Barbell", pattern: "Squat", instructions: "Bar on upper back, brace, sit down between the hips to at least parallel and stand up driving through mid-foot." },
  { name: "Leg Press", aliases: ["Plate-Loaded Leg Press", "45 Degree Leg Press"], primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Machine", pattern: "Squat", instructions: "Feet shoulder-width on the platform, lower until knees are about 90° without the hips rolling, press back up." },
  { name: "Leg Extension", primary: "Quads", equipment: "Machine", pattern: "Isolation", instructions: "Extend the knees fully, pause briefly and lower slowly." },
  { name: "Walking Lunge", aliases: ["Lunge"], primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Dumbbell", pattern: "Lunge", instructions: "Step forward, lower the back knee towards the floor and drive through the front heel." },
  { name: "Romanian Deadlift", aliases: ["RDL"], primary: "Hamstrings", secondary: ["Glutes & Hips", "Back"], equipment: "Barbell", pattern: "Hinge", instructions: "Push hips back with soft knees, lower the bar along the legs to a hamstring stretch and stand tall." },
  { name: "Leg Curl", aliases: ["Hamstring Curl", "Seated Leg Curl"], primary: "Hamstrings", equipment: "Machine", pattern: "Isolation", instructions: "Curl the pad towards the glutes, squeeze and return slowly." },
  { name: "Hip Thrust", primary: "Glutes & Hips", secondary: ["Hamstrings"], equipment: "Barbell", pattern: "Hinge", instructions: "Upper back on a bench, drive the hips up until the torso is level, squeeze the glutes at the top." },
  { name: "Hip Abduction", aliases: ["Hip Abduction (Machine)"], primary: "Glutes & Hips", equipment: "Machine", pattern: "Isolation", instructions: "Push the pads outward against resistance and return slowly." },
  { name: "Hip Adduction", aliases: ["Hip Adduction (Machine)"], primary: "Glutes & Hips", equipment: "Machine", pattern: "Isolation", instructions: "Squeeze the pads together and return slowly." },
  { name: "Standing Calf Raise", aliases: ["Calf Raise"], primary: "Calves", equipment: "Machine", pattern: "Isolation", instructions: "Rise onto the toes with a full stretch at the bottom and a pause at the top." },
  { name: "Barbell Curl", aliases: ["Bicep Curl", "EZ Bar Curl"], primary: "Biceps", equipment: "Barbell", pattern: "Isolation", instructions: "Keep elbows by the sides, curl the bar up and lower under control." },
  { name: "Dumbbell Hammer Curl", aliases: ["Hammer Curl"], primary: "Biceps", equipment: "Dumbbell", pattern: "Isolation", instructions: "Neutral grip, curl the dumbbells without swinging." },
  { name: "Triceps Pushdown", aliases: ["Tricep Pushdown", "Triceps Cable Pushdown", "Rope Pushdown"], primary: "Triceps", equipment: "Cable", pattern: "Isolation", instructions: "Elbows pinned to the sides, extend fully and return to about 90°." },
  { name: "Overhead Triceps Extension", aliases: ["Overhead Tricep Extension"], primary: "Triceps", equipment: "Cable", pattern: "Isolation", instructions: "Hold the weight overhead, lower behind the head and extend the elbows." },
  { name: "Skull Crusher", aliases: ["Lying Triceps Extension"], primary: "Triceps", equipment: "Barbell", pattern: "Isolation", instructions: "Lower the bar towards the forehead by bending the elbows, then extend." },
  { name: "Dip", aliases: ["Parallel Bar Dip"], primary: "Triceps", secondary: ["Chest", "Shoulders"], equipment: "Bodyweight", pattern: "Push", instructions: "Lower until upper arms are about parallel to the floor and press back up." },
  { name: "Assisted Chin-Up", aliases: ["Assisted Chin", "Assisted Chinup", "Chin Assist"], primary: "Back", secondary: ["Biceps"], equipment: ASSISTED_EQUIPMENT, pattern: "Pull", instructions: "Set the assistance, pull the chin over the bar with palms facing you and lower under control. Progress by lowering the assistance.", tips: "Lower assistance = stronger." },
  { name: "Assisted Pull-Up", aliases: ["Assisted Pull", "Assisted Pullup", "Pull Assist"], primary: "Back", secondary: ["Biceps"], equipment: ASSISTED_EQUIPMENT, pattern: "Pull", instructions: "Set the assistance, pull the chest towards the bar with an overhand grip and lower under control. Progress by lowering the assistance.", tips: "Lower assistance = stronger." },
  { name: "Assisted Dip", aliases: ["Dip Assisted", "Dip Assist", "Assisted Dips"], primary: "Triceps", secondary: ["Chest", "Shoulders"], equipment: ASSISTED_EQUIPMENT, pattern: "Push", instructions: "Set the assistance, lower until upper arms are about parallel to the floor and press back up. Progress by lowering the assistance.", tips: "Lower assistance = stronger." },
  // Chest
  { name: "Incline Barbell Press", aliases: ["Incline Bench Press"], primary: "Chest", secondary: ["Shoulders", "Triceps"], equipment: "Barbell", pattern: "Push", instructions: "Press the bar from the upper chest on an incline bench." },
  { name: "Decline Bench Press", primary: "Chest", secondary: ["Triceps"], equipment: "Barbell", pattern: "Push", instructions: "Press the bar from the lower chest on a decline bench." },
  { name: "Dumbbell Bench Press", aliases: ["Flat Dumbbell Press"], primary: "Chest", secondary: ["Triceps", "Shoulders"], equipment: "Dumbbell", pattern: "Push", instructions: "Press the dumbbells up from chest level and lower under control." },
  { name: "Dumbbell Fly", aliases: ["Dumbbell Flye"], primary: "Chest", equipment: "Dumbbell", pattern: "Isolation", instructions: "With soft elbows, open the arms wide and bring them back over the chest." },
  { name: "Smith Machine Bench Press", primary: "Chest", secondary: ["Triceps", "Shoulders"], equipment: "Smith Machine", pattern: "Push", instructions: "Press the guided bar up from the chest and lower under control." },
  { name: "Incline Chest Press (Machine)", aliases: ["Incline Machine Press"], primary: "Chest", secondary: ["Shoulders", "Triceps"], equipment: "Machine", pattern: "Push", instructions: "Press the handles up and forward on the incline machine." },
  { name: "Plate-Loaded Chest Press", aliases: ["Hammer Chest Press"], primary: "Chest", secondary: ["Triceps"], equipment: "Plate-Loaded", pattern: "Push", instructions: "Press the handles forward and return under control." },
  // Back
  { name: "Chin-Up", aliases: ["Underhand Pull-Up"], primary: "Back", secondary: ["Biceps"], equipment: "Bodyweight", pattern: "Pull", instructions: "From a dead hang with an underhand grip, pull the chin over the bar." },
  { name: "Close-Grip Lat Pulldown", primary: "Back", secondary: ["Biceps"], equipment: "Cable", pattern: "Pull", instructions: "Pull the close-grip handle to the upper chest and return slowly." },
  { name: "Machine Row", aliases: ["Seated Row (Machine)", "Chest-Supported Row"], primary: "Back", secondary: ["Biceps"], equipment: "Machine", pattern: "Pull", instructions: "Pull the handles back, squeeze the shoulder blades and return slowly." },
  { name: "Plate-Loaded Row", aliases: ["Hammer Row"], primary: "Back", secondary: ["Biceps"], equipment: "Plate-Loaded", pattern: "Pull", instructions: "Drive the elbows back and squeeze before returning under control." },
  { name: "T-Bar Row", primary: "Back", secondary: ["Biceps"], equipment: "Barbell", pattern: "Pull", instructions: "Hinge forward and pull the handle to the chest keeping the back flat." },
  { name: "Straight-Arm Pulldown", primary: "Back", equipment: "Cable", pattern: "Pull", instructions: "With straight arms, sweep the bar down to the thighs and return slowly." },
  { name: "Back Extension", aliases: ["Hyperextension"], primary: "Back", secondary: ["Glutes & Hips", "Hamstrings"], equipment: "Bodyweight", pattern: "Hinge", instructions: "Hinge at the hips over the pad and raise the torso to neutral." },
  { name: "Rack Pull", primary: "Back", secondary: ["Glutes & Hips", "Hamstrings"], equipment: "Barbell", pattern: "Hinge", instructions: "Pull the bar from knee height to lockout keeping the back flat." },
  // Shoulders
  { name: "Shoulder Press (Machine)", aliases: ["Machine Shoulder Press"], primary: "Shoulders", secondary: ["Triceps"], equipment: "Machine", pattern: "Push", instructions: "Press the handles overhead and lower under control." },
  { name: "Smith Machine Shoulder Press", primary: "Shoulders", secondary: ["Triceps"], equipment: "Smith Machine", pattern: "Push", instructions: "Press the guided bar overhead and lower to chin height." },
  { name: "Arnold Press", primary: "Shoulders", secondary: ["Triceps"], equipment: "Dumbbell", pattern: "Push", instructions: "Rotate the palms from facing you to facing forward as you press overhead." },
  { name: "Cable Lateral Raise", primary: "Shoulders", equipment: "Cable", pattern: "Isolation", instructions: "Raise the handle out to the side to shoulder height and lower slowly." },
  { name: "Rear Delt Fly (Machine)", aliases: ["Reverse Pec Deck", "Rear Delt Fly"], primary: "Shoulders", secondary: ["Back"], equipment: "Machine", pattern: "Isolation", instructions: "Open the arms backwards, squeezing the rear shoulders." },
  { name: "Front Raise", primary: "Shoulders", equipment: "Dumbbell", pattern: "Isolation", instructions: "Raise the weight in front to shoulder height and lower slowly." },
  { name: "Upright Row", primary: "Shoulders", secondary: ["Back"], equipment: "Barbell", pattern: "Pull", instructions: "Pull the bar up to the chest with the elbows leading." },
  { name: "Dumbbell Shrug", aliases: ["Shrug"], primary: "Shoulders", secondary: ["Back"], equipment: "Dumbbell", pattern: "Isolation", instructions: "Lift the shoulders straight up, pause and lower slowly." },
  // Biceps
  { name: "Dumbbell Curl", aliases: ["Alternating Dumbbell Curl"], primary: "Biceps", equipment: "Dumbbell", pattern: "Isolation", instructions: "Curl the dumbbells up without swinging and lower under control." },
  { name: "Preacher Curl", aliases: ["Preacher Curl (Machine)"], primary: "Biceps", equipment: "Machine", pattern: "Isolation", instructions: "With the arms on the pad, curl up and lower to a full stretch." },
  { name: "Cable Curl", primary: "Biceps", equipment: "Cable", pattern: "Isolation", instructions: "Curl the handle up keeping the elbows by the sides." },
  { name: "Incline Dumbbell Curl", primary: "Biceps", equipment: "Dumbbell", pattern: "Isolation", instructions: "Curl from a full stretch on an incline bench." },
  { name: "Concentration Curl", primary: "Biceps", equipment: "Dumbbell", pattern: "Isolation", instructions: "Brace the elbow on the inner thigh and curl with control." },
  // Triceps
  { name: "Close-Grip Bench Press", primary: "Triceps", secondary: ["Chest"], equipment: "Barbell", pattern: "Push", instructions: "Press with hands about shoulder width, elbows tucked." },
  { name: "Triceps Kickback", aliases: ["Tricep Kickback"], primary: "Triceps", equipment: "Dumbbell", pattern: "Isolation", instructions: "Hinge forward and extend the elbow fully, then return slowly." },
  { name: "Triceps Extension (Machine)", aliases: ["Machine Triceps Extension"], primary: "Triceps", equipment: "Machine", pattern: "Isolation", instructions: "Extend the elbows fully against the pad and return slowly." },
  { name: "Bench Dip", primary: "Triceps", secondary: ["Chest", "Shoulders"], equipment: "Bodyweight", pattern: "Push", instructions: "With hands on a bench, lower the hips and press back up." },
  // Quads
  { name: "Front Squat", primary: "Quads", secondary: ["Glutes & Hips", "Core"], equipment: "Barbell", pattern: "Squat", instructions: "Keep the bar on the front shoulders and squat with an upright torso." },
  { name: "Goblet Squat", primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Dumbbell", pattern: "Squat", instructions: "Hold one weight at the chest and squat to depth." },
  { name: "Hack Squat", aliases: ["Hack Squat (Machine)"], primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Plate-Loaded", pattern: "Squat", instructions: "Lower with the back on the pad and press back up." },
  { name: "Smith Machine Squat", primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Smith Machine", pattern: "Squat", instructions: "Squat with the guided bar across the upper back." },
  { name: "Bulgarian Split Squat", aliases: ["Rear-Foot Elevated Split Squat"], primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Dumbbell", pattern: "Lunge", instructions: "With the rear foot on a bench, lower the back knee towards the floor." },
  { name: "Step-Up", primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Dumbbell", pattern: "Lunge", instructions: "Step onto a box driving through the front heel." },
  // Hamstrings and glutes
  { name: "Lying Leg Curl", primary: "Hamstrings", equipment: "Machine", pattern: "Isolation", instructions: "Curl the pad towards the glutes and lower slowly." },
  { name: "Dumbbell Romanian Deadlift", primary: "Hamstrings", secondary: ["Glutes & Hips", "Back"], equipment: "Dumbbell", pattern: "Hinge", instructions: "Hinge at the hips with soft knees and a flat back, then stand." },
  { name: "Good Morning", primary: "Hamstrings", secondary: ["Glutes & Hips", "Back"], equipment: "Barbell", pattern: "Hinge", instructions: "Hinge forward with the bar on the back and a flat spine." },
  { name: "Sumo Deadlift", primary: "Glutes & Hips", secondary: ["Hamstrings", "Back", "Quads"], equipment: "Barbell", pattern: "Hinge", instructions: "Take a wide stance, grip inside the knees and stand tall." },
  { name: "Glute Kickback (Cable)", aliases: ["Cable Kickback"], primary: "Glutes & Hips", equipment: "Cable", pattern: "Isolation", instructions: "Kick the leg back against the cable, squeezing the glute." },
  { name: "Glute Bridge", primary: "Glutes & Hips", secondary: ["Hamstrings"], equipment: "Bodyweight", pattern: "Hinge", instructions: "Drive the hips up from the floor and squeeze at the top." },
  // Calves
  { name: "Seated Calf Raise", primary: "Calves", equipment: "Machine", pattern: "Isolation", instructions: "Raise the heels against the pad and lower to a full stretch." },
  // Core
  { name: "Crunch", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Curl the ribs towards the hips and lower slowly." },
  { name: "Sit-Up", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Raise the torso fully and lower under control." },
  { name: "Ab Crunch (Machine)", aliases: ["Abdominal Machine"], primary: "Core", equipment: "Machine", pattern: "Core", instructions: "Curl forward against the pad, exhaling at the top." },
  { name: "Russian Twist", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Lean back slightly and rotate the torso side to side." },
  { name: "Ab Wheel Rollout", aliases: ["Ab Roller"], primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Roll out with a braced core and pull back without sagging." },
  { name: "Cable Woodchop", aliases: ["Wood Chopper"], primary: "Core", equipment: "Cable", pattern: "Core", instructions: "Rotate the torso, pulling the handle diagonally across the body." },
  { name: "Side Plank", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Hold the body straight on one forearm." },
  { name: "Hanging Knee Raise", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Hang from a bar and raise the knees towards the chest." },
  // Carries and conditioning
  { name: "Farmer's Carry", aliases: ["Farmers Walk"], primary: "Other", equipment: "Dumbbell", pattern: "Carry", instructions: "Walk with a heavy weight in each hand, standing tall." },
  { name: "Kettlebell Swing", primary: "Glutes & Hips", secondary: ["Hamstrings", "Core"], equipment: "Kettlebell", pattern: "Hinge", instructions: "Hinge and snap the hips to swing the bell to chest height." },
  // Cardio
  { name: "Treadmill", aliases: ["Treadmill Run", "Running"], primary: "Other", equipment: "Cardio", pattern: "Cardio", instructions: "Walk, jog or run at a steady, comfortable pace." },
  { name: "Stationary Bike", aliases: ["Exercise Bike", "Spin Bike", "Cycling"], primary: "Other", equipment: "Cardio", pattern: "Cardio", instructions: "Pedal at a steady cadence with the seat at hip height." },
  { name: "Elliptical", aliases: ["Cross Trainer"], primary: "Other", equipment: "Cardio", pattern: "Cardio", instructions: "Stride smoothly, pushing and pulling the handles." },
  { name: "Rowing Machine", aliases: ["Rower", "Erg"], primary: "Other", equipment: "Cardio", pattern: "Cardio", instructions: "Drive with the legs, then lean back and pull the handle to the ribs." },
  { name: "Stair Climber", aliases: ["Stairmaster", "Stepmill"], primary: "Other", equipment: "Cardio", pattern: "Cardio", instructions: "Climb at a steady pace without leaning on the rails." },
  { name: "Air Bike", aliases: ["Assault Bike"], primary: "Other", equipment: "Cardio", pattern: "Cardio", instructions: "Pedal and push-pull the handles; intensity follows effort." },
  { name: "Plank", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Forearms down, body in a straight line, brace the abs and hold." },
  { name: "Cable Crunch", primary: "Core", equipment: "Cable", pattern: "Core", instructions: "Kneel facing the stack and curl the ribs towards the hips." },
  { name: "Hanging Leg Raise", aliases: ["Leg Raise"], primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Hang from a bar and raise the legs without swinging." },
];

/** Category shown in the library for a primary muscle group. */
export function categoryForGroup(group: string): string {
  return group === "Biceps" || group === "Triceps"
    ? "Arms"
    : group === "Quads" || group === "Hamstrings" || group === "Calves"
      ? "Legs"
      : group === "Glutes & Hips"
        ? "Glutes"
        : group;
}

/** Exercise row fields for a starter exercise (shared by the seeder and import). */
export function starterCreateData(ex: StarterExercise, extraAlias?: string) {
  const aliases = [...(ex.aliases ?? []), ...(extraAlias ? [extraAlias] : [])];
  return {
    name: ex.name,
    category: categoryForGroup(ex.primary),
    muscleGroup: ex.primary,
    equipment: ex.equipment,
    aliases: aliases.length ? aliases.join(", ").slice(0, 400) : null,
    secondaryMuscles: ex.secondary?.join(", ") ?? null,
    movementPattern: ex.pattern,
    instructions: ex.instructions,
    tips: ex.tips ?? null,
    isCustom: false,
    active: true,
  };
}

/** Name + alias lookup keys, lower-cased. */
export function exerciseKeys(name: string, aliases?: string | string[] | null): string[] {
  const list = Array.isArray(aliases)
    ? aliases
    : (aliases ?? "").split(",").map((a) => a.trim());
  return [name, ...list].map((k) => k.trim().toLowerCase()).filter(Boolean);
}
