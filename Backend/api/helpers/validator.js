const { z } = require("zod");

// Define Zod schema for Admin model validation
const AdminSchema = z.object({
  first_name: z.string().min(2, { message: "First name is required" }), // Required and must be a non-empty string
  last_name: z.string().optional(), // Optional and must be a string if provided
  father_name: z.string().optional(), // Optional and must be a string if provided
  nationality: z.string().optional(), // Optional and must be a string if provided
  rank: z.string().optional(),
  username: z.string().min(1, { message: "Username is required" }), // Required and must be a non-empty string
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" }), // Required, with a minimum length of 8
  gender: z.string().optional(),
  salt: z.string().min(1, { message: "Salt is required" }), // Required and must be a non-empty string
  phone: z
    .string()
    // .regex(/^\+?\d{10,15}$/, { message: "Invalid phone number format" })
    .optional(), // Optional and must match the regex for phone numbers if provided
  photo: z.string().optional(), // Optional and must be a valid URL if provided
  role: z
    .string(z.enum(["admin", "superAdmin"]))
    .optional()
    .default("admin"), // Required and must be one of the enumerated values
  birthDate: z
    .preprocess(
      (val) => (val === undefined || val === null || val === "" ? undefined : new Date(val)),
      z.date().optional()
    ),
  createdAt: z
    .date()
    .optional()
    .default(() => new Date()), // Optional, defaults to now
  updatedAt: z
    .date()
    .optional()
    .default(() => new Date()), // Optional, defaults to now
});

// Define Zod schema for Form model validation
const FormSchema = z.object({
  name: z
    .string()
    .min(1, { message: "Name is required" })
    .max(100, { message: "Name must be at most 100 characters long" }),
  description: z
    .string()
    .min(1, { message: "Description must be at least 1 character long" })
    .max(250, { message: "Description must be at most 250 characters long" }),
  length: z
    .number()
    .int({ message: "Length must be an integer" })
    .min(1, { message: "Length must be at least 1" })
    .max(10, { message: "Length must be at most 10" }),
  month: z.number().int({ message: "Month must be an integer" }).min(1, { message: "Month must be at least 1" }).max(12, { message: "Month must be at most 12" }),
});

const AccessStatus = z.object({
  name: z.string().min(1, { message: "Name is required" }),
});

const RelativeSchema = z.object({
  registrationId: z.string().min(1, { message: "Relationship is required" }),
  regNumber: z.string().min(1, { message: "Registration number is required" }),
  birthYear: z.number().optional(),
  birthDate: z
    .union([z.date(), z.string().datetime()])
    .optional()
    .transform((val) => (val ? new Date(val) : null)),
  birthPlace: z.string().optional(),
  residence: z.string().optional(),
  workplace: z.string().optional(),
  position: z.string().optional(),
  accessStatus: z.string().optional(),
  notes: z.string().optional(),
  whoAdd: z.string().optional(),
  or_tab: z.string().optional(),
  additionalNotes: z.string().optional(),
  pinfl: z.string().optional(),
  firstName: z.string().min(1, { message: "First name is required" }),
  lastName: z.string().min(1, { message: "Last name is required" }),
  fatherName: z.string().optional(),
});

const RegistrationSchema = z.object({
  regNumber: z.string().min(1, { message: "Registration number is required" }),
  regDate: z.union([z.date(), z.string().datetime()]).optional().transform((val) => (val ? new Date(val) : null)),
  expiredDate: z.optional(z.union([z.date(), z.string().datetime()])).transform((val) => (val ? new Date(val) : null)),
  form_reg: z.string().min(1, { message: "Form is required" }),
  conclusionRegNum: z.string().optional(),
  firstName: z.string().min(1, { message: "First name is required" }),
  lastName: z.string().min(1, { message: "Last name is required" }),
  fatherName: z.string().optional(),
  birthYear: z.number().optional(),
  birthDate: z
    .union([z.date(), z.string().datetime()])
    .optional()
    .transform((val) => (val ? new Date(val) : null)),
  birthPlace: z.string().optional(),
  residence: z.string().optional(),
  workplace: z.string().optional(),
  position: z.string().optional(),
  nationality: z.string().optional(),
  accessStatus: z.string().optional(),
  notes: z.string().optional(),
  additionalNotes: z.string().optional(),
  moreNotes: z.string().optional(),
  executorId: z.string().optional(),
  recordNumber: z.string().optional(),
  model: z.string().optional(),
  or_tab: z.string(),
  whoAdd: z.string().optional(),
  externalNotes: z.string().optional(),
  pinfl: z.string().optional(),
  passport: z.string().optional(),
});

const WorkPlaceSchema = z.object({
  name: z.string().min(1, { message: "WorkPlace name is required" }),
});

const RelationDegreeSchema = z.object({
  name: z.string().min(1, { message: "Relation degree name is required" }),
});

const InitiatorSchema = z.object({
  first_name: z.string().min(1, { message: "First name is required" }),
  last_name: z.string().min(1, { message: "Last name is required" }),
  father_name: z.string().min(1, { message: "Father name is required" }),
  rank: z.string().optional(),
  notes: z.string().optional(),
});

const RaportTypeSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  code: z.string().min(1, { message: "Code is required" }),
  code_ru: z.string().min(1, { message: "Code ru is required" }),
  code_uz: z.string().min(1, { message: "Code uz is required" }),
  organization: z.string().min(1, { message: "Organization is required" }),
  requested_organization: z.string().min(1, { message: "Requested organization is required" }),
  link: z.string().optional(),
  notes: z.string().optional(),
  data: z.record(z.any()).optional(),
  executorId: z.string().optional(),
});

module.exports = {
  AdminSchema,
  FormSchema,
  RelativeSchema,
  RegistrationSchema,
  WorkPlaceSchema,
  RelationDegreeSchema,
  InitiatorSchema,
  AccessStatus,
  RaportTypeSchema,
};
