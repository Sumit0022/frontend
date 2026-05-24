import { redirect } from "next/navigation";

export default function Home() {
  // Website khulte hi seedha login par bhej dega
  redirect("/login");
}