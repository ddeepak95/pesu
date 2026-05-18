import { redirect } from "next/navigation";

/** Change this path when the try/demo destination changes. */
const TRY_REDIRECT_URL = "/assignment/U-qOw_dV";

export default function TryPage() {
  redirect(TRY_REDIRECT_URL);
}
