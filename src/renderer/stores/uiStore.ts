import { create } from 'zustand';

interface UIStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  modalOpen: string | null;
  openModal: (id: string) => void;
  closeModal: () => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  modalOpen: null,
  openModal: (id) => set({ modalOpen: id }),
  closeModal: () => set({ modalOpen: null }),
}));
