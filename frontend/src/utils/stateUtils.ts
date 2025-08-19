import { useCallback, useEffect, useRef } from 'react';
import { usePageState } from '../contexts/StateContext';

// Scroll position management
export const useScrollPosition = (enabled: boolean = true) => {
  const scrollRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const saveScrollPosition = useCallback(() => {
    if (enabled) {
      scrollRef.current = {
        x: window.pageXOffset || document.documentElement.scrollLeft,
        y: window.pageYOffset || document.documentElement.scrollTop
      };
    }
  }, [enabled]);

  const restoreScrollPosition = useCallback(() => {
    if (enabled && scrollRef.current) {
      setTimeout(() => {
        window.scrollTo(scrollRef.current.x, scrollRef.current.y);
      }, 100);
    }
  }, [enabled]);

  useEffect(() => {
    if (enabled) {
      window.addEventListener('scroll', saveScrollPosition);
      return () => window.removeEventListener('scroll', saveScrollPosition);
    }
  }, [enabled, saveScrollPosition]);

  return { saveScrollPosition, restoreScrollPosition, scrollPosition: scrollRef.current };
};

// Form state management
export const useFormState = <T extends Record<string, unknown>>(
  initialState: T,
  formKey: string
) => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;

  const getFormState = useCallback((): T => {
    const pageState = getPageState(pageKey);
    return (pageState?.[formKey] as T) || initialState;
  }, [getPageState, pageKey, formKey, initialState]);

  const setFormState = useCallback((newState: Partial<T> | ((prev: T) => T)) => {
    const currentPageState = getPageState(pageKey) || {};
    const currentFormState = (currentPageState[formKey] as T) || initialState;
    
    const updatedFormState = typeof newState === 'function' 
      ? newState(currentFormState)
      : { ...currentFormState, ...newState };

    setPageState(pageKey, {
      ...currentPageState,
      [formKey]: updatedFormState
    });
  }, [getPageState, setPageState, pageKey, formKey, initialState]);

  const resetFormState = useCallback(() => {
    const currentPageState = getPageState(pageKey) || {};
    const { [formKey]: _removed, ...remainingState } = currentPageState;
    void _removed; // Explicitly mark as used
    setPageState(pageKey, remainingState);
  }, [getPageState, setPageState, pageKey, formKey]);

  return {
    formState: getFormState(),
    setFormState,
    resetFormState
  };
};

// Modal state management
export const useModalState = (defaultOpen: boolean = false) => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;
  const modalKey = 'modal_state'; // Use a default key

  const getModalState = useCallback((): boolean => {
    const pageState = getPageState(pageKey);
    return (pageState?.[modalKey] as boolean) ?? defaultOpen;
  }, [getPageState, pageKey, modalKey, defaultOpen]);

  const setModalState = useCallback((isOpen: boolean | ((prev: boolean) => boolean)) => {
    const currentPageState = getPageState(pageKey) || {};
    const currentModalState = (currentPageState[modalKey] as boolean) ?? defaultOpen;
    
    const updatedModalState = typeof isOpen === 'function' 
      ? isOpen(currentModalState)
      : isOpen;

    setPageState(pageKey, {
      ...currentPageState,
      [modalKey]: updatedModalState
    });
  }, [getPageState, setPageState, pageKey, modalKey, defaultOpen]);

  return [getModalState(), setModalState] as const;
};

// Pagination state management
export const usePaginationState = (defaultPage: number = 1, defaultPerPage: number = 10) => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;
  const paginationKey = 'pagination';

  const getPaginationState = useCallback(() => {
    const pageState = getPageState(pageKey);
    const pagination = pageState?.[paginationKey] as { page?: number; perPage?: number } | undefined;
    return {
      page: pagination?.page ?? defaultPage,
      perPage: pagination?.perPage ?? defaultPerPage
    };
  }, [getPageState, pageKey, paginationKey, defaultPage, defaultPerPage]);

  const setPaginationState = useCallback((updates: { page?: number; perPage?: number }) => {
    const currentPageState = getPageState(pageKey) || {};
    const currentPagination = getPaginationState();
    
    setPageState(pageKey, {
      ...currentPageState,
      [paginationKey]: {
        ...currentPagination,
        ...updates
      }
    });
  }, [getPageState, setPageState, pageKey, paginationKey, getPaginationState]);

  return {
    paginationState: getPaginationState(),
    setPaginationState
  };
};

// Filter state management
export const useFilterState = <T extends Record<string, unknown>>(defaultFilters: T) => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;
  const filterKey = 'filters';

  const getFilterState = useCallback((): T => {
    const pageState = getPageState(pageKey);
    return (pageState?.[filterKey] as T) || defaultFilters;
  }, [getPageState, pageKey, filterKey, defaultFilters]);

  const setFilterState = useCallback((updates: Partial<T> | ((prev: T) => T)) => {
    const currentPageState = getPageState(pageKey) || {};
    const currentFilters = getFilterState();
    
    const updatedFilters = typeof updates === 'function' 
      ? updates(currentFilters)
      : { ...currentFilters, ...updates };

    setPageState(pageKey, {
      ...currentPageState,
      [filterKey]: updatedFilters
    });
  }, [getPageState, setPageState, pageKey, filterKey, getFilterState]);

  const resetFilters = useCallback(() => {
    const currentPageState = getPageState(pageKey) || {};
    const { [filterKey]: _removed, ...remainingState } = currentPageState;
    void _removed; // Explicitly mark as used
    setPageState(pageKey, remainingState);
  }, [getPageState, setPageState, pageKey, filterKey]);

  return {
    filters: getFilterState(),
    setFilters: setFilterState,
    resetFilters
  };
};

// Search state management
export const useSearchState = (defaultSearch: string = '') => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;
  const searchKey = 'search';

  const getSearchState = useCallback((): string => {
    const pageState = getPageState(pageKey);
    return (pageState?.[searchKey] as string) || defaultSearch;
  }, [getPageState, pageKey, searchKey, defaultSearch]);

  const setSearchState = useCallback((searchTerm: string) => {
    const currentPageState = getPageState(pageKey) || {};
    setPageState(pageKey, {
      ...currentPageState,
      [searchKey]: searchTerm
    });
  }, [getPageState, setPageState, pageKey, searchKey]);

  const resetSearch = useCallback(() => {
    const currentPageState = getPageState(pageKey) || {};
    const { [searchKey]: _removed, ...remainingState } = currentPageState;
    void _removed; // Explicitly mark as used
    setPageState(pageKey, remainingState);
  }, [getPageState, setPageState, pageKey, searchKey]);

  return {
    searchTerm: getSearchState(),
    setSearchTerm: setSearchState,
    clearSearch: resetSearch
  };
};

// Sort state management
export const useSortState = (defaultField: string = '', defaultDirection: 'asc' | 'desc' = 'asc') => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;
  const sortKey = 'sort';

  const getSortState = useCallback(() => {
    const pageState = getPageState(pageKey);
    const sort = pageState?.[sortKey] as { field?: string; direction?: 'asc' | 'desc' } | undefined;
    return {
      field: sort?.field || defaultField,
      direction: sort?.direction || defaultDirection
    };
  }, [getPageState, pageKey, sortKey, defaultField, defaultDirection]);

  const setSortState = useCallback((updates: { field?: string; direction?: 'asc' | 'desc' }) => {
    const currentPageState = getPageState(pageKey) || {};
    const currentSort = getSortState();
    
    setPageState(pageKey, {
      ...currentPageState,
      [sortKey]: {
        ...currentSort,
        ...updates
      }
    });
  }, [getPageState, setPageState, pageKey, sortKey, getSortState]);

  const resetSort = useCallback(() => {
    const currentPageState = getPageState(pageKey) || {};
    const { [sortKey]: _removed, ...remainingState } = currentPageState;
    void _removed; // Explicitly mark as used
    setPageState(pageKey, remainingState);
  }, [getPageState, setPageState, pageKey, sortKey]);

  return {
    sortState: getSortState(),
    setSortState,
    resetSort
  };
};

// Data state management
export const useDataState = <T>(dataKey: string, defaultData: T) => {
  const { getPageState, setPageState } = usePageState();
  const pageKey = window.location.pathname;

  const getDataState = useCallback((): T => {
    const pageState = getPageState(pageKey);
    return (pageState?.[dataKey] as T) || defaultData;
  }, [getPageState, pageKey, dataKey, defaultData]);

  const setDataState = useCallback((newData: T | ((prev: T) => T)) => {
    const currentPageState = getPageState(pageKey) || {};
    const currentData = getDataState();
    
    const updatedData = typeof newData === 'function' 
      ? (newData as (prev: T) => T)(currentData)
      : newData;

    setPageState(pageKey, {
      ...currentPageState,
      [dataKey]: updatedData
    });
  }, [getPageState, setPageState, pageKey, dataKey, getDataState]);

  const clearData = useCallback(() => {
    const currentPageState = getPageState(pageKey) || {};
    const { [dataKey]: _removed, ...remainingState } = currentPageState;
    void _removed; // Explicitly mark as used
    setPageState(pageKey, remainingState);
  }, [getPageState, setPageState, pageKey, dataKey]);

  return {
    data: getDataState(),
    setData: setDataState,
    clearData
  };
};

// Clear all page states
export const useClearPageStates = () => {
  const { clearPageState } = usePageState();
  const pageKey = window.location.pathname;

  const clearCurrentPageStates = useCallback(() => {
    clearPageState(pageKey);
  }, [clearPageState, pageKey]);

  return { clearCurrentPageStates };
};

// Storage info
export const useStorageInfo = () => {
  const { getStateSize } = usePageState();
  
  return {
    storageSize: getStateSize()
  };
};
