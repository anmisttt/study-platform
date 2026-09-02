import path from "path";
import dotenv from "dotenv";
import { RoomsDb } from "../db/roomsDb";

dotenv.config({ path: path.join(__dirname, "../../.env") });
dotenv.config();

function main(): void {
  const roomsDb = new RoomsDb();
  try {
    if (!roomsDb.hasRoomsTable()) {
      console.log(`${new Date().toISOString()} Rooms table does not exist; skipping cleanup.`);
      return;
    }

    const { deleted, ids } = roomsDb.deleteStaleRooms();
    const timestamp = new Date().toISOString();
    if (deleted === 0) {
      console.log(`${timestamp} No stale rooms to delete.`);
      return;
    }
    console.log(`${timestamp} Deleted ${deleted} stale room(s): ${ids.join(", ")}`);
  } finally {
    roomsDb.close();
  }
}

try {
  main();
} catch (error: unknown) {
  console.error(error);
  process.exit(1);
}
