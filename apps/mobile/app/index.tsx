import { Redirect, type Href } from "expo-router";

const SPLASH_ROUTE = "/(splash)" as Href;

export default function IndexRedirect() {
  return <Redirect href={SPLASH_ROUTE} />;
}
