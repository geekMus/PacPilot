import packageJson from "../package.json";
import { PROJECT_LINKS } from "@shared/project-links";

export const APP_VERSION = String(packageJson.version);
export const PROJECT_URL = PROJECT_LINKS.repository;
