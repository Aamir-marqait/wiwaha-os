import type { AppRole } from "@wiwaha/db";

/**
 * The reference lists people add to and edit by hand (vendors, stock, the
 * price book, spaces, rooms, dishes, plan templates). One generic editor
 * (`components/catalogue-editor.tsx`) renders each from this spec; the
 * database's row-level security decides who may write.
 */
export type FieldKind = "text" | "textarea" | "number" | "rupees" | "percent" | "date" | "select" | "checkbox" | "image" | "images";
export interface FieldSpec {
  key: string;
  label: string;
  kind: FieldKind;
  options?: readonly string[];
  required?: boolean;
  /** Shown on the card's first line. */
  primary?: boolean;
  placeholder?: string;
  /** Default for a new row. */
  initial?: string | number | boolean;
}
export interface CatalogueSpec {
  key: string;
  table: string;
  title: string;
  singular: string;
  description: string;
  editRoles: readonly AppRole[];
  viewRoles: readonly AppRole[];
  order: { column: string; ascending?: boolean }[];
  fields: readonly FieldSpec[];
  /** Fixed values written on insert (never shown). */
  fixed?: Record<string, string | number | boolean>;
}

const ROLES: AppRole[] = ["owner", "sales", "event_manager", "staff", "accounts"];
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
const PROOF = ["none", "tick", "photo", "file"] as const;
const FUNCTION_TYPES = ["haldi", "mehendi", "sangeet", "wedding", "reception", "engagement", "cocktail", "pooja", "other"] as const;
const VENDOR_CATEGORIES = ["photography", "decor", "catering", "music", "makeup", "lighting", "transport", "priest", "florist", "entertainment", "other"] as const;

const ENTERTAINMENT = ["dj", "live_band", "classical_music", "dhol", "nadaswaram", "anchor", "dancers", "magician", "fireworks", "kids_entertainment", "other"] as const;
const EXTRAS = ["makeup", "mehendi_artist", "hair_styling", "laundry", "welcome_drinks", "photo_booth", "transport", "spa", "babysitting", "gifting", "other"] as const;
const DECOR_AREAS = ["Directional boards", "Main door entry", "View cutter", "Lobby", "Staircase", "Mandap", "Stage", "Dining", "Lawn", "Poolside", "Haldi setup", "Mehendi setup", "Sangeet stage", "Photo corner", "Other"] as const;

export const CATALOGUES: Record<string, CatalogueSpec> = {
  entertainment: {
    key: "entertainment", table: "service_options", title: "Entertainment", singular: "act",
    description: "Artists and acts we can offer: DJs, bands, dhol, anchors and more. Couples only ever pick from this list. The price to the client and our cost feed Prashanth's costing.",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "sales", "event_manager", "accounts"],
    order: [{ column: "sort" }, { column: "name" }],
    fixed: { vertical: "entertainment" },
    fields: [
      { key: "name", label: "Name", kind: "text", required: true, primary: true },
      { key: "category", label: "Type", kind: "select", options: ENTERTAINMENT, required: true, initial: "dj" },
      { key: "image_url", label: "Photo", kind: "image" },
      { key: "unit", label: "Unit", kind: "text", required: true, initial: "per function" },
      { key: "rate_paise", label: "Price to client (₹)", kind: "rupees" },
      { key: "cost_paise", label: "Our cost (₹)", kind: "rupees" },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "description", label: "What the couple sees", kind: "textarea" },
    ],
  },
  extras: {
    key: "extras", table: "service_options", title: "Extras", singular: "extra",
    description: "Add-on services: makeup, laundry, welcome drinks and more. Tick \"Guests can book\" to offer it on the guest page too.",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "sales", "event_manager", "accounts"],
    order: [{ column: "sort" }, { column: "name" }],
    fixed: { vertical: "extras" },
    fields: [
      { key: "name", label: "Name", kind: "text", required: true, primary: true },
      { key: "category", label: "Type", kind: "select", options: EXTRAS, required: true, initial: "makeup" },
      { key: "image_url", label: "Photo", kind: "image" },
      { key: "unit", label: "Unit", kind: "text", required: true, initial: "per person" },
      { key: "rate_paise", label: "Price to client (₹)", kind: "rupees" },
      { key: "cost_paise", label: "Our cost (₹)", kind: "rupees" },
      { key: "guest_bookable", label: "Guests can book", kind: "checkbox", initial: false },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "description", label: "What the couple sees", kind: "textarea" },
    ],
  },
  decor_templates: {
    key: "decor_templates", table: "decor_templates", title: "Décor templates", singular: "template",
    description: "Sample moodboards by area: a photo of the spot as it is, and photos of what we've done there. The Design agent starts each couple's moodboards from these.",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "sales", "event_manager"],
    order: [{ column: "sort" }, { column: "area" }, { column: "title" }],
    fields: [
      { key: "title", label: "Title", kind: "text", required: true, primary: true, placeholder: "e.g. Marigold arch" },
      { key: "area", label: "Area", kind: "select", options: DECOR_AREAS, required: true, initial: "Main door entry" },
      { key: "function_type", label: "Function (optional)", kind: "select", options: ["", ...FUNCTION_TYPES], initial: "" },
      { key: "design_kind", label: "Standard or custom", kind: "select", options: ["standard", "custom"], required: true, initial: "standard" },
      { key: "reference_image_url", label: "The area as it is", kind: "image" },
      { key: "examples", label: "Photos of our work here", kind: "images" },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "description", label: "Description", kind: "textarea" },
    ],
  },
  vendors: {
    key: "vendors", table: "vendors", title: "Vendors", singular: "vendor",
    description: "The vendors the Vendor Coordinator asks to lock dates. Preferred vendors are asked first; only designated planners may deliver décor.",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "sales", "event_manager", "accounts"],
    order: [{ column: "category" }, { column: "name" }],
    fields: [
      { key: "name", label: "Name", kind: "text", required: true, primary: true },
      { key: "category", label: "Category", kind: "select", options: VENDOR_CATEGORIES, required: true, initial: "photography" },
      { key: "contact_name", label: "Contact person", kind: "text" },
      { key: "phone_e164", label: "Phone", kind: "text", placeholder: "+91…" },
      { key: "email", label: "Email", kind: "text" },
      { key: "rating", label: "Rating (0–5)", kind: "number" },
      { key: "preferred", label: "Preferred", kind: "checkbox", initial: false },
      { key: "designated_planner", label: "Designated décor planner", kind: "checkbox", initial: false },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  inventory: {
    key: "inventory", table: "inventory_items", title: "Inventory", singular: "item",
    description: "Furniture, linen, crockery and consumables. Below the reorder level, the Estate agent raises a purchase request.",
    editRoles: ["owner", "staff"], viewRoles: ["owner", "staff", "event_manager", "accounts"],
    order: [{ column: "category" }, { column: "name" }],
    fields: [
      { key: "name", label: "Item", kind: "text", required: true, primary: true },
      { key: "category", label: "Category", kind: "select", options: ["furniture", "linen", "crockery", "consumables", "decor", "electrical", "other"], required: true, initial: "furniture" },
      { key: "quantity", label: "Quantity in stock", kind: "number", required: true, initial: 0 },
      { key: "unit", label: "Unit", kind: "text", required: true, initial: "pcs" },
      { key: "reorder_level", label: "Reorder at", kind: "number", required: true, initial: 0 },
      { key: "unit_cost_paise", label: "Cost per unit (₹)", kind: "rupees" },
      { key: "location", label: "Kept at", kind: "text" },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  maintenance: {
    key: "maintenance", table: "maintenance_schedules", title: "Maintenance schedules", singular: "schedule",
    description: "Recurring upkeep. When one is due, the Estate agent puts a task on the estate team's list (photo proof).",
    editRoles: ["owner", "staff"], viewRoles: ["owner", "staff", "event_manager"],
    order: [{ column: "next_due_on" }],
    fields: [
      { key: "name", label: "Job", kind: "text", required: true, primary: true },
      { key: "category", label: "Area", kind: "select", options: ["garden", "pool", "ac", "generator", "pest_control", "electrical", "plumbing", "housekeeping", "other"], required: true, initial: "garden" },
      { key: "frequency_days", label: "Every (days)", kind: "number", required: true, initial: 30 },
      { key: "next_due_on", label: "Next due", kind: "date" },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  price_book: {
    key: "price_book", table: "price_book_items", title: "Price book", singular: "price",
    description: "Every price the Quote agent uses. Anything not here becomes an off-book line for Prashanth to price.",
    editRoles: ["owner"], viewRoles: ["owner", "sales", "event_manager", "accounts"],
    order: [{ column: "category" }, { column: "code" }],
    fields: [
      { key: "name", label: "Item", kind: "text", required: true, primary: true },
      { key: "code", label: "Code", kind: "text", required: true, placeholder: "e.g. DEC-MANDAP-S" },
      { key: "category", label: "Category", kind: "select", options: ["venue", "rooms", "catering", "decor", "av", "services"], required: true, initial: "venue" },
      { key: "unit", label: "Charged", kind: "select", options: ["each", "per_day", "per_night", "per_plate", "lump_sum"], required: true, initial: "each" },
      { key: "unit_price_paise", label: "Price (₹)", kind: "rupees", required: true },
      { key: "cost_paise", label: "Our cost (₹)", kind: "rupees" },
      { key: "gst_rate_bps", label: "GST (%)", kind: "percent", initial: 18 },
      { key: "design_kind", label: "Décor kind", kind: "select", options: ["", "standard", "custom"], initial: "" },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  spaces: {
    key: "spaces", table: "spaces", title: "Spaces", singular: "space",
    description: "The lawns, halls and courtyards on the calendar. Capacity decides which spaces agents suggest.",
    editRoles: ["owner"], viewRoles: ROLES,
    order: [{ column: "sort" }],
    fields: [
      { key: "name", label: "Name", kind: "text", required: true, primary: true },
      { key: "kind", label: "Type", kind: "select", options: ["outdoor", "indoor", "semi_open"], required: true, initial: "outdoor" },
      { key: "capacity_seated", label: "Seated guests", kind: "number", required: true, initial: 100 },
      { key: "capacity_floating", label: "Standing guests", kind: "number" },
      { key: "description", label: "Description", kind: "textarea" },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
    ],
  },
  rooms: {
    key: "rooms", table: "rooms", title: "Guest rooms", singular: "room",
    description: "Rooms the Rooms & Guests agent allocates. Untick Active for rooms that aren't built yet (expansion to 60).",
    editRoles: ["owner", "staff"], viewRoles: ROLES,
    order: [{ column: "sort" }, { column: "number" }],
    fields: [
      { key: "number", label: "Room number", kind: "text", required: true, primary: true },
      { key: "room_type", label: "Type", kind: "select", options: ["deluxe", "premium", "suite", "family", "other"], required: true, initial: "deluxe" },
      { key: "capacity", label: "Sleeps", kind: "number", required: true, initial: 2 },
      { key: "block", label: "Block", kind: "text" },
      { key: "floor", label: "Floor", kind: "number" },
      { key: "status", label: "Status", kind: "select", options: ["available", "maintenance", "out_of_service"], initial: "available" },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
      { key: "notes", label: "Notes", kind: "textarea" },
    ],
  },
  dishes: {
    key: "dishes", table: "menu_library", title: "Menu dishes", singular: "dish",
    description: "The dishes the Menu agent builds each function's menu from, by cuisine and course.",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "sales", "event_manager", "accounts", "staff"],
    order: [{ column: "cuisine" }, { column: "sort" }],
    fields: [
      { key: "name", label: "Dish", kind: "text", required: true, primary: true },
      { key: "cuisine", label: "Cuisine", kind: "text", required: true, placeholder: "South Indian" },
      { key: "course", label: "Course", kind: "select", options: ["welcome", "starter", "main", "bread", "rice", "dessert", "beverage"], required: true, initial: "main" },
      { key: "is_veg", label: "Vegetarian", kind: "checkbox", initial: true },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
    ],
  },
  plan: {
    key: "plan", table: "task_templates", title: "Countdown plan steps", singular: "step",
    description: "The steps the Planner puts on people's lists for every wedding. Days before the event: 90 means T-90, 0 the first day, -1 the day after.",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "event_manager", "sales", "staff", "accounts"],
    order: [{ column: "t_minus_days", ascending: false }, { column: "sort" }],
    fixed: { plan_key: "standard_wedding", scope: "wedding" },
    fields: [
      { key: "title", label: "Step", kind: "text", required: true, primary: true },
      { key: "t_minus_days", label: "Days before the event", kind: "number", required: true, initial: 30 },
      { key: "default_role", label: "Done by", kind: "select", options: ["event_manager", "staff", "accounts", "sales", "owner"], required: true, initial: "event_manager" },
      { key: "priority", label: "Priority", kind: "select", options: PRIORITIES, initial: "normal" },
      { key: "proof_kind", label: "Proof", kind: "select", options: PROOF, initial: "tick" },
      { key: "buffer_hours", label: "Grace before escalating (hours)", kind: "number", initial: 24 },
      { key: "description", label: "Details", kind: "textarea" },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
    ],
  },
  run_of_show: {
    key: "run_of_show", table: "run_of_show_templates", title: "Run-of-show steps", singular: "step",
    description: "The Planner lays out each function's run-of-show from these. Minutes are relative to the function's start (negative = before).",
    editRoles: ["owner", "event_manager"], viewRoles: ["owner", "event_manager", "sales", "staff"],
    order: [{ column: "function_type" }, { column: "offset_minutes" }],
    fields: [
      { key: "title", label: "Step", kind: "text", required: true, primary: true },
      { key: "function_type", label: "Function", kind: "select", options: FUNCTION_TYPES, required: true, initial: "wedding" },
      { key: "offset_minutes", label: "Starts (minutes from function start)", kind: "number", required: true, initial: 0 },
      { key: "duration_minutes", label: "Lasts (minutes)", kind: "number", initial: 60 },
      { key: "owner_label", label: "Who", kind: "text", placeholder: "Event manager" },
      { key: "vendor_category", label: "Vendor category", kind: "select", options: ["", ...VENDOR_CATEGORIES], initial: "" },
      { key: "sort", label: "Order", kind: "number", initial: 100 },
      { key: "active", label: "Active", kind: "checkbox", initial: true },
    ],
  },
};

export type CatalogueValues = Record<string, string | boolean>;

/** Form values → a database row (₹ → paise, % → basis points). Returns an error sentence instead when something is wrong. */
export function toRow(spec: CatalogueSpec, values: CatalogueValues): { row: Record<string, unknown> } | { error: string } {
  const row: Record<string, unknown> = {};
  for (const f of spec.fields) {
    const raw = values[f.key];
    if (f.kind === "checkbox") { row[f.key] = raw === true || raw === "true" || raw === "on"; continue; }
    const s = typeof raw === "string" ? raw.trim() : "";
    if (!s) {
      if (f.required) return { error: `${f.label} is required.` };
      row[f.key] = f.kind === "images" ? [] : null;
      continue;
    }
    switch (f.kind) {
      case "number": {
        const n = Number(s);
        if (!Number.isFinite(n)) return { error: `${f.label} must be a number.` };
        row[f.key] = n;
        break;
      }
      case "rupees": {
        const n = Number(s.replace(/[,₹\s]/g, ""));
        if (!Number.isFinite(n) || n < 0) return { error: `${f.label} must be an amount in rupees.` };
        row[f.key] = Math.round(n * 100);
        break;
      }
      case "percent": {
        const n = Number(s.replace("%", ""));
        if (!Number.isFinite(n) || n < 0 || n > 28) return { error: `${f.label} must be between 0 and 28.` };
        row[f.key] = Math.round(n * 100);
        break;
      }
      case "image":
        if (!/^https:\/\/\S+$/.test(s)) return { error: `${f.label} must be an https link or an uploaded photo.` };
        row[f.key] = s;
        break;
      case "images": {
        const urls = s.split(/\s+/).filter(Boolean);
        if (urls.some((u) => !/^https:\/\/\S+$/.test(u))) return { error: `${f.label}: each photo must be an https link.` };
        row[f.key] = urls.slice(0, 24).map((url) => ({ url }));
        break;
      }
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { error: `${f.label} must be a date.` };
        row[f.key] = s;
        break;
      case "select":
        if (!f.options?.includes(s)) return { error: `Choose a ${f.label.toLowerCase()}.` };
        row[f.key] = s;
        break;
      default:
        row[f.key] = s.slice(0, f.kind === "textarea" ? 4000 : 300);
    }
  }
  return { row };
}

/** A database row → form values (paise → ₹, basis points → %). */
export function toValues(spec: CatalogueSpec, row: Record<string, unknown> | null): CatalogueValues {
  const v: CatalogueValues = {};
  for (const f of spec.fields) {
    const x = row ? row[f.key] : f.initial;
    if (f.kind === "checkbox") v[f.key] = row ? x === true : f.initial === true;
    else if (x === null || x === undefined) v[f.key] = "";
    else if (f.kind === "images") v[f.key] = Array.isArray(x) ? x.map((i: unknown) => (i && typeof i === "object" && "url" in i ? String((i as { url: unknown }).url) : "")).filter(Boolean).join("\n") : "";
    else if (row && f.kind === "rupees") v[f.key] = String(Number(x) / 100);
    else if (row && f.kind === "percent") v[f.key] = String(Number(x) / 100);
    else v[f.key] = String(x);
  }
  return v;
}
