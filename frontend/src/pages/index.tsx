import type { NextPage } from "next";
import OnboardingLanding from "../components/OnboardingLanding";

// The base-URL onboarding surface. All landing/gate logic lives in
// OnboardingLanding, shared with the configured flow routes ([flow].tsx);
// flowRoute null = "use the flow configured at the base URL, if any".
const Home: NextPage = () => <OnboardingLanding flowRoute={null} />;

export default Home;
