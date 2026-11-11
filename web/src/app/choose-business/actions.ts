"use server";

import { redirect } from "next/navigation";
import { chooseBusiness } from "@/lib/server/session";

export async function chooseBusinessAction(form: FormData) {
  await chooseBusiness(Number(form.get("businessId")));
  redirect("/");
}
