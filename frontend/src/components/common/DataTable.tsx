import React from 'react';
import LoadingSpinner from './LoadingSpinner';
import Pagination from './Pagination';

interface Column<T> {
  key: keyof T | string;
  title: string;
  render?: (value: any, record: T, index: number) => React.ReactNode;
  sortable?: boolean;
  width?: string;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  pagination?: {
    current: number;
    total: number;
    pageSize: number;
    onChange: (page: number) => void;
  };
  sortConfig?: {
    key: string;
    direction: 'asc' | 'desc';
  };
  onSort?: (key: string) => void;
  emptyText?: string;
  className?: string;
  rowKey?: keyof T | ((record: T) => string | number);
  onRowClick?: (record: T, index: number) => void;
}

function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  pagination,
  sortConfig,
  onSort,
  emptyText = 'No data available',
  className = '',
  rowKey = 'id' as keyof T,
  onRowClick,
}: DataTableProps<T>) {
  const getRowKey = (record: T, index: number): string | number => {
    if (typeof rowKey === 'function') {
      return rowKey(record);
    }
    return record[rowKey] || index;
  };

  const handleSort = (key: string) => {
    if (onSort) {
      onSort(key);
    }
  };

  const renderSortIcon = (columnKey: string) => {
    if (!sortConfig || sortConfig.key !== columnKey) {
      return <i className="fas fa-sort text-muted ml-1"></i>;
    }
    
    return (
      <i className={`fas fa-sort-${sortConfig.direction === 'asc' ? 'up' : 'down'} ml-1`}></i>
    );
  };

  const getCellValue = (record: T, column: Column<T>) => {
    if (typeof column.key === 'string' && column.key.includes('.')) {
      // Handle nested properties like 'user.name'
      const keys = column.key.split('.');
      let value = record;
      for (const key of keys) {
        value = value?.[key];
      }
      return value;
    }
    return record[column.key as keyof T];
  };

  if (loading) {
    return (
      <div className="text-center py-5">
        <LoadingSpinner size="lg" text="Loading data..." />
      </div>
    );
  }

  return (
    <div className={`data-table ${className}`}>
      <div className="table-responsive">
        <table className="table table-hover">
          <thead className="thead-light">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  style={{ width: column.width }}
                  className={`${column.className || ''} ${column.sortable ? 'sortable' : ''}`}
                  onClick={() => column.sortable && handleSort(column.key as string)}
                >
                  <div className="d-flex align-items-center">
                    {column.title}
                    {column.sortable && renderSortIcon(column.key as string)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-4 text-muted">
                  <i className="fas fa-inbox fa-2x mb-2 d-block"></i>
                  {emptyText}
                </td>
              </tr>
            ) : (
              data.map((record, index) => (
                <tr
                  key={getRowKey(record, index)}
                  className={onRowClick ? 'cursor-pointer' : ''}
                  onClick={() => onRowClick?.(record, index)}
                >
                  {columns.map((column, colIndex) => {
                    const cellValue = getCellValue(record, column);
                    return (
                      <td key={colIndex} className={column.className}>
                        {column.render
                          ? column.render(cellValue, record, index)
                          : (cellValue != null && typeof cellValue === 'object' && !React.isValidElement(cellValue)
                              ? JSON.stringify(cellValue)
                              : String(cellValue ?? ''))
                        }
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {pagination && (
        <div className="mt-3">
          <Pagination
            currentPage={pagination.current}
            totalPages={Math.ceil(pagination.total / pagination.pageSize)}
            onPageChange={pagination.onChange}
            totalItems={pagination.total}
            itemsPerPage={pagination.pageSize}
          />
        </div>
      )}
    </div>
  );
}

export default DataTable;