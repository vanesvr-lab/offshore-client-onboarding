import { describe, it, expect, beforeEach } from "vitest";
import { useWizardStore } from "@/stores/wizardStore";

const initialBusinessDetails = {
  business_name: "",
  business_type: "",
  business_country: "",
  business_address: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  contact_title: "",
  ubo_data: [],
};

describe("useWizardStore", () => {
  beforeEach(() => {
    useWizardStore.getState().reset();
  });

  it("starts with default state", () => {
    const s = useWizardStore.getState();
    expect(s.applicationId).toBeNull();
    expect(s.templateId).toBeNull();
    expect(s.businessDetails).toEqual(initialBusinessDetails);
  });

  it("setApplicationId updates only applicationId", () => {
    useWizardStore.getState().setApplicationId("app-123");
    const s = useWizardStore.getState();
    expect(s.applicationId).toBe("app-123");
    expect(s.templateId).toBeNull();
    expect(s.businessDetails).toEqual(initialBusinessDetails);
  });

  it("setTemplateId updates only templateId", () => {
    useWizardStore.getState().setTemplateId("tpl-1");
    const s = useWizardStore.getState();
    expect(s.templateId).toBe("tpl-1");
    expect(s.applicationId).toBeNull();
  });

  it("setBusinessDetails merges partial updates with existing fields", () => {
    useWizardStore.getState().setBusinessDetails({ business_name: "Acme" });
    expect(useWizardStore.getState().businessDetails.business_name).toBe("Acme");
    // Other fields preserved
    expect(useWizardStore.getState().businessDetails.business_type).toBe("");

    useWizardStore.getState().setBusinessDetails({ business_type: "GBC" });
    const s = useWizardStore.getState();
    // Both fields now set
    expect(s.businessDetails.business_name).toBe("Acme");
    expect(s.businessDetails.business_type).toBe("GBC");
  });

  it("reset returns to the initial state", () => {
    const store = useWizardStore.getState();
    store.setApplicationId("app-x");
    store.setTemplateId("tpl-x");
    store.setBusinessDetails({ business_name: "X", business_address: "1 St" });
    store.reset();

    const s = useWizardStore.getState();
    expect(s.applicationId).toBeNull();
    expect(s.templateId).toBeNull();
    expect(s.businessDetails).toEqual(initialBusinessDetails);
  });
});
