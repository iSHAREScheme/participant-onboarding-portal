// Public onboarding flow routes (/exampledataspace1, ...). Static pages take
// precedence over this dynamic segment, and the backend refuses flow routes
// colliding with reserved page names, so only configured flows resolve here.
import type { NextPage } from "next";
import { useRouter } from "next/router";
import OnboardingLanding from "../components/OnboardingLanding";

const FlowPage: NextPage = () => {
  const router = useRouter();
  const raw = router.query.flow;
  const flowRoute = typeof raw === "string" ? raw : null;
  // Until the router has hydrated the param, render nothing route-specific.
  if (!router.isReady || flowRoute === null) return null;
  return <OnboardingLanding flowRoute={flowRoute} />;
};

export default FlowPage;
