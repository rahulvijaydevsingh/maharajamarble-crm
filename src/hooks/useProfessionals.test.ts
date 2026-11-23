import { describe, expect, it } from "vitest";
import { mergeProfessionalById, type Professional } from "./useProfessionals";

const professional = (id: string, name: string) => ({ id, name }) as Professional;

describe("mergeProfessionalById", () => {
  it("keeps exactly one professional when the saved row arrives again from realtime", () => {
    const savedProfessional = professional("professional-1", "Amit Sharma");
    const nextProfessionals = mergeProfessionalById([savedProfessional], savedProfessional);

    expect(nextProfessionals).toHaveLength(1);
    expect(nextProfessionals[0].id).toBe("professional-1");
  });
});