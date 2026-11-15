import { createAccess, type Db } from "./access";
import { createConsultationsService } from "./consultations";
import { createNotificationsService } from "./notifications";
import { createPeopleService } from "./people";
import { createTutorsService } from "./tutors";

/**
 * Every service for one request, built around one shared `access` (who is asking and what their role
 * allows), so the role is looked up at most once however many services the request touches.
 */
export function createServices(db: Db, userId: string) {
  const access = createAccess(db, userId);
  return {
    consultations: createConsultationsService(db, access),
    tutors: createTutorsService(db),
    people: createPeopleService(db, access),
    notifications: createNotificationsService(db, access),
  };
}

export type Services = ReturnType<typeof createServices>;
