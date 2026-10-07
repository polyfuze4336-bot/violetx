// Starter exercise library. Pure data, loaded on demand by the owner; existing
// exercises (matched by name or alias, case-insensitive) are never modified.

import type { MuscleGroup } from "@/lib/training-analytics";

export interface StarterExercise {
  name: string;
  aliases?: string[];
  primary: MuscleGroup;
  secondary?: MuscleGroup[];
  equipment: string;
  pattern: "Push" | "Pull" | "Squat" | "Hinge" | "Lunge" | "Carry" | "Core" | "Isolation";
  instructions: string;
  tips?: string;
}

export const STARTER_EXERCISES: StarterExercise[] = [
  { name: "Barbell Bench Press", aliases: ["Bench Press", "Flat Bench"], primary: "Chest", secondary: ["Triceps", "Shoulders"], equipment: "Barbell", pattern: "Push", instructions: "Lie on a flat bench, grip just wider than shoulders, lower the bar to mid-chest under control and press back up.", tips: "Keep shoulder blades pinned back and feet planted." },
  { name: "Incline Dumbbell Press", aliases: ["Incline DB Press"], primary: "Chest", secondary: ["Shoulders", "Triceps"], equipment: "Dumbbell", pattern: "Push", instructions: "Set the bench to 30–45°, press the dumbbells up and slightly together, lower to a deep chest stretch." },
  { name: "Chest Press (Machine)", aliases: ["Machine Chest Press"], primary: "Chest", secondary: ["Triceps"], equipment: "Machine", pattern: "Push", instructions: "Adjust the seat so handles line up with mid-chest, press forward without locking out hard." },
  { name: "Pec Fly (Machine)", aliases: ["Pec Deck"], primary: "Chest", equipment: "Machine", pattern: "Isolation", instructions: "Bring the handles together in a wide arc, squeeze the chest, return slowly to a comfortable stretch." },
  { name: "Cable Fly", aliases: ["Cable Crossover"], primary: "Chest", equipment: "Cable", pattern: "Isolation", instructions: "With a slight elbow bend, sweep the handles together in front of the chest and return under control." },
  { name: "Push-Up", aliases: ["Press Up"], primary: "Chest", secondary: ["Triceps", "Shoulders"], equipment: "Bodyweight", pattern: "Push", instructions: "Keep a straight line from head to heels, lower the chest to the floor and press back up." },
  { name: "Overhead Press", aliases: ["Shoulder Press", "OHP", "Military Press"], primary: "Shoulders", secondary: ["Triceps"], equipment: "Barbell", pattern: "Push", instructions: "Press the bar from the collarbone to overhead, squeezing glutes and keeping ribs down." },
  { name: "Dumbbell Shoulder Press", aliases: ["DB Shoulder Press"], primary: "Shoulders", secondary: ["Triceps"], equipment: "Dumbbell", pattern: "Push", instructions: "Press dumbbells overhead from shoulder height, lowering until upper arms are about parallel to the floor." },
  { name: "Lateral Raise", aliases: ["Side Raise"], primary: "Shoulders", equipment: "Dumbbell", pattern: "Isolation", instructions: "Raise the dumbbells out to the sides to shoulder height with a soft elbow bend, lower slowly.", tips: "Lead with the elbows and avoid swinging." },
  { name: "Face Pull", primary: "Shoulders", secondary: ["Back"], equipment: "Cable", pattern: "Pull", instructions: "Pull the rope towards the face, elbows high, separating the hands at the end." },
  { name: "Deadlift", aliases: ["Conventional Deadlift"], primary: "Back", secondary: ["Hamstrings", "Glutes & Hips"], equipment: "Barbell", pattern: "Hinge", instructions: "Hinge at the hips, keep the bar close and back neutral, drive the floor away and lock out with the glutes." },
  { name: "Lat Pulldown", aliases: ["Pulldown"], primary: "Back", secondary: ["Biceps"], equipment: "Cable", pattern: "Pull", instructions: "Pull the bar to the upper chest by driving the elbows down, control the return to a full stretch." },
  { name: "Pull-Up", aliases: ["Chin-Up", "Assisted Pull-Up"], primary: "Back", secondary: ["Biceps"], equipment: "Bodyweight", pattern: "Pull", instructions: "From a dead hang, pull the chest towards the bar and lower under control." },
  { name: "Seated Cable Row", aliases: ["Cable Row", "Low Row"], primary: "Back", secondary: ["Biceps"], equipment: "Cable", pattern: "Pull", instructions: "Sit tall, pull the handle to the lower ribs, squeeze the shoulder blades and return slowly." },
  { name: "Barbell Row", aliases: ["Bent-Over Row"], primary: "Back", secondary: ["Biceps"], equipment: "Barbell", pattern: "Pull", instructions: "Hinge to about 45°, pull the bar to the lower ribs keeping the back flat." },
  { name: "Dumbbell Row", aliases: ["One-Arm Row", "Single-Arm Row"], primary: "Back", secondary: ["Biceps"], equipment: "Dumbbell", pattern: "Pull", instructions: "Brace on a bench, pull the dumbbell to the hip and lower to a full stretch." },
  { name: "Back Squat", aliases: ["Squat", "Barbell Squat"], primary: "Quads", secondary: ["Glutes & Hips", "Hamstrings"], equipment: "Barbell", pattern: "Squat", instructions: "Bar on upper back, brace, sit down between the hips to at least parallel and stand up driving through mid-foot." },
  { name: "Leg Press", primary: "Quads", secondary: ["Glutes & Hips"], equipment: "Machine", pattern: "Squat", instructions: "Feet shoulder-width on the platform, lower until knees are about 90° without the hips rolling, press back up." },
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
  { name: "Triceps Pushdown", aliases: ["Tricep Pushdown", "Triceps Cable Pushdown"], primary: "Triceps", equipment: "Cable", pattern: "Isolation", instructions: "Elbows pinned to the sides, extend fully and return to about 90°." },
  { name: "Overhead Triceps Extension", aliases: ["Overhead Tricep Extension"], primary: "Triceps", equipment: "Cable", pattern: "Isolation", instructions: "Hold the weight overhead, lower behind the head and extend the elbows." },
  { name: "Skull Crusher", aliases: ["Lying Triceps Extension"], primary: "Triceps", equipment: "Barbell", pattern: "Isolation", instructions: "Lower the bar towards the forehead by bending the elbows, then extend." },
  { name: "Dip", aliases: ["Assisted Dip", "Parallel Bar Dip"], primary: "Triceps", secondary: ["Chest", "Shoulders"], equipment: "Bodyweight", pattern: "Push", instructions: "Lower until upper arms are about parallel to the floor and press back up." },
  { name: "Plank", primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Forearms down, body in a straight line, brace the abs and hold." },
  { name: "Cable Crunch", primary: "Core", equipment: "Cable", pattern: "Core", instructions: "Kneel facing the stack and curl the ribs towards the hips." },
  { name: "Hanging Leg Raise", aliases: ["Leg Raise"], primary: "Core", equipment: "Bodyweight", pattern: "Core", instructions: "Hang from a bar and raise the legs without swinging." },
];

/** Name + alias lookup keys, lower-cased. */
export function exerciseKeys(name: string, aliases?: string | string[] | null): string[] {
  const list = Array.isArray(aliases)
    ? aliases
    : (aliases ?? "").split(",").map((a) => a.trim());
  return [name, ...list].map((k) => k.trim().toLowerCase()).filter(Boolean);
}
