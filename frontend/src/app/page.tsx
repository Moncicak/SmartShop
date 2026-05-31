import { redirect } from "next/navigation";

// Root redirect — middleware handles auth, this just points to dashboard
export default function Home() {
  redirect("/dashboard");
}
