import { create } from "zustand";
import type { UBO } from "@/types";

interface BusinessDetails {
  business_name: string;
  business_type: string;
  business_country: string;
  business_address: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_title: string;
  ubo_data: UBO[];
}

interface WizardStore {
  applicationId: string | null;
  templateId: string | null;
  businessDetails: BusinessDetails;
  setApplicationId: (id: string) => void;
  setTemplateId: (id: string) => void;
  setBusinessDetails: (details: Partial<BusinessDetails>) => void;
  reset: () => void;
}

const defaultBusinessDetails: BusinessDetails = {
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

export const useWizardStore = create<WizardStore>((set) => ({
  applicationId: null,
  templateId: null,
  businessDetails: defaultBusinessDetails,
  setApplicationId: (id) => set({ applicationId: id }),
  setTemplateId: (id) => set({ templateId: id }),
  setBusinessDetails: (details) =>
    set((state) => ({
      businessDetails: { ...state.businessDetails, ...details },
    })),
  reset: () =>
    set({
      applicationId: null,
      templateId: null,
      businessDetails: defaultBusinessDetails,
    }),
}));
