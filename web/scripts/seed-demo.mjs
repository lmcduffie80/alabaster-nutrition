// Creates "Demo Cafe" for App Review: a manager account, staff, two published weeks, punches and inventory.
// Run once against the database in DATABASE_URL: `node scripts/seed-demo.mjs` (DRY_RUN=1 rolls back). Refuses to run twice.
// PINs are left unset (they need the production PIN_PEPPER); set them from the Team page afterwards.
import pg from "pg";

const MANAGER_EMAIL = "lee+appreview@innovative-cc.com";
const TIME_ZONE = "America/New_York";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");

function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Local New York wall time to an instant. */
function at(date, hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const local = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(guess)
    .split(":")
    .map(Number);
  const offsetMinutes = (local[0] * 60 + local[1] - (h * 60 + m) + 1440 * 1.5) % 1440 - 720;
  return new Date(guess.getTime() - offsetMinutes * 60_000);
}

function mondayOf(now) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
  return addDays(today, -((weekday + 6) % 7));
}

const now = new Date();
const thisMonday = mondayOf(now);
const lastMonday = addDays(thisMonday, -7);
const nextMonday = addDays(thisMonday, 7);

const staff = [
  { key: "manager", name: "Jamie Rivera", role: "manager", email: MANAGER_EMAIL },
  { key: "ava", name: "Ava Chen", role: "employee" },
  { key: "marcus", name: "Marcus Bell", role: "employee" },
  { key: "priya", name: "Priya Patel", role: "employee" },
  { key: "diego", name: "Diego Santos", role: "employee" },
];

// Per weekday (0 = Monday): who opens (7:00–13:00) and who closes (13:00–19:00).
const rota = [
  ["ava", "diego"],
  ["marcus", "priya"],
  ["ava", "diego"],
  ["priya", "marcus"],
  ["ava", "diego"],
  ["marcus", "priya"],
  ["manager", "ava"],
];

/** Deterministic deviations, keyed by `${weekOffset}:${day}:${who}`: minutes late, or "calledIn". */
const exceptions = {
  "-7:1:marcus": 14,
  "-7:3:priya": "calledIn",
  "-7:4:diego": 9,
  "0:1:marcus": 12,
  "0:2:ava": -6,
};

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("begin");
  const existing = await client.query("select id from business where name = 'Demo Cafe'");
  if (existing.rowCount) throw new Error(`Demo Cafe already exists (business ${existing.rows[0].id}).`);

  const {
    rows: [business],
  } = await client.query(
    "insert into business (name, time_zone, pay_period_anchor) values ('Demo Cafe', $1, $2) returning id",
    [TIME_ZONE, thisMonday],
  );
  await client.query("select set_config('app.business_id', $1, true)", [String(business.id)]);
  await client.query("set local role tenant_app");

  const ids = {};
  for (const [index, person] of staff.entries()) {
    const { rows } = await client.query(
      "insert into employee (display_name, role, color_index, email) values ($1, $2, $3, $4) returning id",
      [person.name, person.role, index, person.email ?? null],
    );
    ids[person.key] = rows[0].id;
  }

  const punch = (who, kind, when) =>
    client.query("insert into punch (employee_id, kind, at, source) values ($1, $2, $3, 'kiosk')", [ids[who], kind, when]);

  for (const monday of [lastMonday, thisMonday, nextMonday]) {
    const weekOffset = Math.round((new Date(monday) - new Date(thisMonday)) / 86_400_000);
    await client.query("insert into schedule_week (week_start, published_at) values ($1, now())", [monday]);
    for (const [day, [opener, closer]] of rota.entries()) {
      const date = addDays(monday, day);
      for (const [who, start, end, position] of [
        [opener, "07:00", "13:00", "Opener"],
        [closer, "13:00", "19:00", "Closer"],
      ]) {
        const startsAt = at(date, start);
        const endsAt = at(date, end);
        const exception = exceptions[`${weekOffset}:${day}:${who}`];
        await client.query(
          `insert into shift (employee_id, week_start, starts_at, ends_at, position, called_in_at, called_in_note, called_in_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          exception === "calledIn"
            ? [ids[who], monday, startsAt, endsAt, position, new Date(startsAt.getTime() - 90 * 60_000), "Sick", MANAGER_EMAIL]
            : [ids[who], monday, startsAt, endsAt, position, null, "", null],
        );
        if (exception === "calledIn" || startsAt > now) continue;

        const late = typeof exception === "number" ? exception : (day + who.length) % 4;
        const clockIn = new Date(startsAt.getTime() + late * 60_000);
        await punch(who, "clockIn", clockIn);
        const breakStart = new Date(startsAt.getTime() + 180 * 60_000);
        if (breakStart < now) {
          await punch(who, "breakStart", breakStart);
          const breakEnd = new Date(breakStart.getTime() + 30 * 60_000);
          if (breakEnd < now) await punch(who, "breakEnd", breakEnd);
        }
        const clockOut = new Date(endsAt.getTime() + ((day * 3) % 7) * 60_000);
        if (clockOut < now) await punch(who, "clockOut", clockOut);
      }
    }
  }

  const spot = async (name, sortOrder) =>
    (await client.query("insert into storage_spot (name, sort_order) values ($1, $2) returning id", [name, sortOrder])).rows[0].id;
  const spots = { shelf: await spot("Back shelf", 1), fridge: await spot("Walk-in fridge", 2), counter: await spot("Front counter", 3) };

  const supplier = async (name, contact) =>
    (await client.query("insert into supplier (name, contact) values ($1, $2) returning id", [name, contact])).rows[0].id;
  const suppliers = {
    sysco: await supplier("Sysco", "orders@sysco.example · (555) 010-2000"),
    depot: await supplier("Restaurant Depot", "(555) 010-3000"),
  };

  const items = [
    ["Vanilla protein", "ingredient", "tub", "shelf", "sysco", "VP-2LB", 2, 4, 10, 38.5, 3],
    ["Chocolate protein", "ingredient", "tub", "shelf", "sysco", "CP-2LB", 2, 4, 10, 38.5, 7],
    ["Frozen strawberries", "ingredient", "bag", "fridge", "depot", "FS-5", 4, 6, 16, 12.75, 5],
    ["Bananas", "ingredient", "bunch", "fridge", "depot", null, 1, 8, 20, 2.1, 12],
    ["Almond milk", "ingredient", "carton", "fridge", "sysco", "AM-64", 6, 6, 18, 3.4, 4],
    ["16 oz cups", "supply", "sleeve of 50 cups", "counter", "sysco", "CUP16", 20, 4, 12, 6.2, 9],
    ["Dome lids", "supply", "sleeve of 50 lids", "counter", "sysco", "LID16", 20, 4, 12, 4.8, 3],
    ["Straws", "supply", "box", "counter", "depot", null, 1, 2, 6, 9.0, 4],
  ];
  const itemIds = [];
  for (const [name, type, unit, spotKey, supplierKey, code, packSize, reorderAt, orderUpTo, cost] of items) {
    const { rows } = await client.query(
      `insert into inventory_item (name, type, unit, spot_id, supplier_id, supplier_code, pack_size, reorder_at, order_up_to, default_unit_cost)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [name, type, unit, spots[spotKey], suppliers[supplierKey], code, packSize, reorderAt, orderUpTo, cost],
    );
    itemIds.push(rows[0].id);
  }

  const countDay = addDays(thisMonday, -1);
  const {
    rows: [count],
  } = await client.query(
    `insert into inventory_count (status, started_at, started_by, finished_at, finished_by)
     values ('finished', $1, $2, $3, $2) returning id`,
    [at(countDay, "18:30"), ids.manager, at(countDay, "18:55")],
  );
  for (const [index, item] of items.entries()) {
    await client.query(
      "insert into inventory_count_line (count_id, item_id, quantity, entered_by, entered_at) values ($1, $2, $3, $4, $5)",
      [count.id, itemIds[index], item[10], ids.manager, at(countDay, "18:45")],
    );
  }

  const { rows: totals } = await client.query(
    `select (select count(*) from employee) employees, (select count(*) from shift) shifts,
            (select count(*) from punch) punches, (select count(*) from inventory_item) items`,
  );
  console.log(totals[0]);
  if (process.env.DRY_RUN) {
    await client.query("rollback");
    console.log("Dry run: rolled back.");
  } else {
    await client.query("commit");
    console.log(`Demo Cafe created as business ${business.id}. Manager: ${MANAGER_EMAIL}. Set PINs on the Team page.`);
  }
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  await client.end();
}
