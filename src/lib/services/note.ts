import { noteRepository } from "@/lib/repositories/note";
import { NotFoundError } from "@/lib/rbac";
import {
  requireOwnerAthlete,
  requireViewerAthlete,
} from "@/lib/services/context";
import {
  createNoteSchema,
  updateNoteSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "@/lib/schemas";
import { toNoteDTO, type NoteDTO } from "@/lib/dto";

export const noteService = {
  async list(): Promise<NoteDTO[]> {
    const { athleteId } = await requireViewerAthlete();
    const rows = await noteRepository.list(athleteId);
    return rows.map(toNoteDTO);
  },

  async create(input: CreateNoteInput): Promise<NoteDTO> {
    const { athleteId } = await requireOwnerAthlete();
    const data = createNoteSchema.parse(input);
    const created = await noteRepository.create({
      athleteId,
      date: data.date,
      title: data.title ?? null,
      body: data.body,
    });
    return toNoteDTO(created);
  },

  async update(input: UpdateNoteInput): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const data = updateNoteSchema.parse(input);
    const count = await noteRepository.update(athleteId, data.id, {
      ...(data.date !== undefined ? { date: data.date } : {}),
      ...(data.title !== undefined ? { title: data.title ?? null } : {}),
      ...(data.body !== undefined ? { body: data.body } : {}),
    });
    if (count === 0) throw new NotFoundError("Note not found.");
  },

  async delete(id: string): Promise<void> {
    const { athleteId } = await requireOwnerAthlete();
    const count = await noteRepository.delete(athleteId, id);
    if (count === 0) throw new NotFoundError("Note not found.");
  },
};
