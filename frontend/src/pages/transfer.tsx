import { NextPage } from "next";
import { useEffect } from "react";
import { useRouter } from "next/router";

// Transfer was merged into the unified Revoke / Transfer page. Redirect any
// direct navigation or stale bookmarks to it (the Transfer action is preselected
// there). Kept as a route so old links don't 404.
const Transfer: NextPage = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace("/revoke?action=transfer");
  }, [router]);
  return null;
};

export default Transfer;
