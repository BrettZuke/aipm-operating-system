// Settoku routes /today as a standalone page in the OPERATIONS section
// Redirect to the actual implementation at /tasks/today
import { redirect } from "next/navigation";

export default function TodayRedirect() {
  redirect("/tasks/today");
}
