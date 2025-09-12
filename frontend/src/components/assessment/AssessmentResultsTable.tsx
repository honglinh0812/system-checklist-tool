import React, { useState, useMemo } from 'react';

interface AssessmentResult {
  server_ip: string;
  command_name: string;
  command_text: string;
  status: 'OK' | 'Not OK' | 'SKIPPED' | 'N/A';
  output: string;
  actual_output?: string;
  reference_value: string;
  expected_output?: string;
  skip_reason?: string;
  skipped?: boolean;
  validation_result?: string;
  decision?: string;
  title?: string;
  command_id_ref?: string;
  consolidated_results?: Array<{
    server_ip: string;
    variables?: string;
    status: string;
    output?: string;
    expected?: string;
    validation_result?: string;
    decision?: string;
    skipped?: boolean;
    skip_reason?: string;
  }>;
  recommendations?: Array<{
    title: string;
    description: string;
    commands: string[];
    explanation: string;
  }>;
}

interface AssessmentResultsTableProps {
  results: AssessmentResult[];
  onServerFilterChange?: (selectedServers: string[]) => void;
}

const AssessmentResultsTable: React.FC<AssessmentResultsTableProps> = ({ 
  results, 
  onServerFilterChange 
}) => {

  const [selectedServers, setSelectedServers] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'server' | 'command' | 'status'>('server');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  const [showRecommendationsModal, setShowRecommendationsModal] = useState(false);
  const [selectedRecommendations, setSelectedRecommendations] = useState<AssessmentResult['recommendations']>([]);
  const [selectedCommandTitle, setSelectedCommandTitle] = useState<string>('');

  // Get unique servers for dropdown
  const uniqueServers = useMemo(() => {
    const servers = [...new Set(results.map(result => result.server_ip))];
    return servers.sort();
  }, [results]);

  // Filter and sort results
  const filteredResults = useMemo(() => {
    let filtered = [...results];

    // Filter by selected servers
    if (selectedServers.length > 0) {
      filtered = filtered.filter(result => selectedServers.includes(result.server_ip));
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(result => 
        result.command_name.toLowerCase().includes(term) ||
        result.command_text.toLowerCase().includes(term) ||
        result.server_ip.toLowerCase().includes(term) ||
        (result.output || '').toLowerCase().includes(term)
      );
    }

    // Sort results
    filtered.sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'server':
          compareValue = a.server_ip.localeCompare(b.server_ip);
          break;
        case 'command':
          compareValue = a.command_name.localeCompare(b.command_name);
          break;
        case 'status':
          const statusOrder = { 'OK': 1, 'Not OK': 2, 'SKIPPED': 3, 'N/A': 4 };
          compareValue = (statusOrder[a.status] || 5) - (statusOrder[b.status] || 5);
          break;
      }

      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

    return filtered;
  }, [results, selectedServers, searchTerm, sortBy, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredResults.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedResults = filteredResults.slice(startIndex, startIndex + itemsPerPage);

  // Handle server selection
  const handleServerSelection = (server: string) => {
    const newSelection = selectedServers.includes(server)
      ? selectedServers.filter(s => s !== server)
      : [...selectedServers, server];
    
    setSelectedServers(newSelection);
    setCurrentPage(1);
    onServerFilterChange?.(newSelection);
  };

  // CSS Styles
   const cardStyle = {
     transition: 'all 0.3s ease',
     cursor: 'pointer',
     border: '1px solid rgba(0,0,0,0.125)',
     borderRadius: '0.5rem'
   };
 
   const cardHoverStyle = {
     transform: 'translateY(-2px)',
     boxShadow: '0 8px 25px rgba(0,0,0,0.15)',
     borderColor: 'rgba(0,123,255,0.25)'
   };

  // Toggle row expansion
  const toggleRowExpansion = (index: number) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  // Handle recommendations modal
  const handleShowRecommendations = (result: AssessmentResult) => {
    setSelectedRecommendations(result.recommendations || []);
    setSelectedCommandTitle(result.title || result.command_name || 'Command');
    setShowRecommendationsModal(true);
  };

  const handleCloseRecommendations = () => {
    setShowRecommendationsModal(false);
    setSelectedRecommendations([]);
    setSelectedCommandTitle('');
  };

  // Get status badge
  const getStatusBadge = (result: AssessmentResult) => {
    // Kiểm tra điều kiện skip trước, bao gồm validation_result chứa 'skipped'
    const validationResult = result.validation_result?.toLowerCase();
    const decision = result.decision?.toLowerCase();
    
    if (result.skipped || result.skip_reason || result.command_name?.startsWith('skip') || 
        validationResult?.includes('skipped') || decision === 'approved' && result.skipped) {
      return (
        <span className="badge badge-warning d-flex align-items-center">
          <i className="fas fa-forward mr-1"></i>
          OK (skipped)
        </span>
      );
    }
    
    if (validationResult === 'ok' || validationResult === 'pass' || validationResult === 'passed' || 
        decision === 'ok' || decision === 'pass' || decision === 'passed' || decision === 'approved') {
      return (
        <span className="badge badge-success d-flex align-items-center">
          <i className="fas fa-check-circle mr-1"></i>
          OK
        </span>
      );
    }
    
    if (validationResult === 'not ok' || validationResult === 'fail' || validationResult === 'failed' ||
        decision === 'not ok' || decision === 'fail' || decision === 'failed') {
      return (
        <span className="badge badge-danger d-flex align-items-center">
          <i className="fas fa-times-circle mr-1"></i>
          Not OK
        </span>
      );
    }

    // Fallback: kiểm tra status field cũ
    const status = result.status?.toLowerCase();
    switch (status) {
      case 'ok':
      case 'success':
      case 'passed':
        return (
          <span className="badge badge-success d-flex align-items-center">
            <i className="fas fa-check-circle mr-1"></i>
            OK
          </span>
        );
      case 'not ok':
      case 'failed':
      case 'error':
        return (
          <span className="badge badge-danger d-flex align-items-center">
            <i className="fas fa-times-circle mr-1"></i>
            Not OK
          </span>
        );
      case 'skipped':
      case 'skip':
        return (
          <span className="badge badge-warning d-flex align-items-center">
            <i className="fas fa-forward mr-1"></i>
            OK (skipped)
          </span>
        );
      default:
        return (
          <span className="badge badge-secondary d-flex align-items-center">
            <i className="fas fa-question-circle mr-1"></i>
            N/A
          </span>
        );
    }
  };

  // Helper function to get result status
   const getResultStatus = (result: AssessmentResult) => {
     const validationResult = result.validation_result?.toLowerCase();
     const decision = result.decision?.toLowerCase();
     
     // Check for skipped commands first - including validation_result containing 'skipped'
     if (result.skipped || result.skip_reason || result.command_name?.startsWith('skip') || 
         validationResult?.includes('skipped') || (decision === 'approved' && result.skipped)) {
       return 'skipped';
     }
     
     // Check for APPROVED decision
     if (decision === 'approved') {
       return 'ok';
     }
     
     // Check for REJECTED decision
     if (decision === 'rejected') {
       return 'not_ok';
     }
     
     // Check validation_result
     if (validationResult === 'ok' || validationResult === 'pass' || validationResult === 'passed') {
       return 'ok';
     }
     
     if (validationResult === 'not ok' || validationResult === 'fail' || validationResult === 'failed') {
       return 'not_ok';
     }
     
     // Fallback to status field
     const status = result.status?.toLowerCase();
     if (status === 'ok' || status === 'success' || status === 'passed') return 'ok';
     if (status === 'not ok' || status === 'failed' || status === 'error') return 'not_ok';
     if (status === 'skipped' || status === 'skip') return 'skipped';
     
     return 'N/A';
   };

  // Calculate statistics
  const stats = useMemo(() => {
    const filtered = selectedServers.length > 0 
      ? results.filter(r => selectedServers.includes(r.server_ip))
      : results;
    
    // Sử dụng getResultStatus để tính toán
    
    const okCount = filtered.filter(r => getResultStatus(r) === 'ok').length;
    const notOkCount = filtered.filter(r => getResultStatus(r) === 'not_ok').length;
    const skippedCount = filtered.filter(r => getResultStatus(r) === 'skipped').length;
    const unknownCount = filtered.filter(r => getResultStatus(r) === 'N/A').length;
    
    return {
      total: filtered.length,
      ok: okCount,
      notOk: notOkCount,
      skipped: skippedCount,
      na: unknownCount
    };
  }, [results, selectedServers]);

  return (
    <div className="assessment-results-table">
      {/* Header with controls */}
      <div className="card mb-4">
        {/* <div className="card-header">
          <div className="row align-items-center">
            <div className="col-md-6">
              <h5 className="mb-0">
                <i className="fas fa-table mr-2"></i>
                Assessment Results
              </h5>
            </div>
            <div className="col-md-6 text-right">
              <span className="text-muted">
                {filteredResults.length} results
              </span>
            </div>
          </div>
        </div> */}
        <div className="card-body">
          {/* Statistics */}
          <div className="row mb-4">
            <div className="col-md-12">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-gradient-primary text-white">
                  <h5 className="mb-0">
                    <i className="fas fa-chart-bar mr-2"></i>
                    Assessment Results Overview
                  </h5>
                </div>
                <div className="card-body p-4">
                  <div className="row text-center">
                    <div className="col-lg-2 col-md-4 col-sm-6 mb-3">
                       <div className="stat-card p-3 rounded border" style={cardStyle} 
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHoverStyle)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}>
                         <div className="stat-icon text-primary mb-2">
                           <i className="fas fa-list-alt fa-2x"></i>
                         </div>
                         <span className="h3 mb-0 text-primary font-weight-bold">{stats.total}</span>
                         <div className="small text-muted mt-1">Total Commands</div>
                       </div>
                     </div>
                    <div className="col-lg-2 col-md-4 col-sm-6 mb-3">
                       <div className="stat-card p-3 rounded border border-success" style={cardStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHoverStyle)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}>
                         <div className="stat-icon text-success mb-2">
                           <i className="fas fa-check-circle fa-2x"></i>
                         </div>
                         <span className="h3 mb-0 text-success font-weight-bold">{stats.ok}</span>
                         <div className="small text-muted mt-1">OK</div>
                         <div className="progress mt-2" style={{height: '4px'}}>
                           <div className="progress-bar bg-success" style={{width: `${stats.total > 0 ? (stats.ok / stats.total * 100) : 0}%`}}></div>
                         </div>
                       </div>
                     </div>
                    <div className="col-lg-2 col-md-4 col-sm-6 mb-3">
                       <div className="stat-card p-3 rounded border border-danger" style={cardStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHoverStyle)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}>
                         <div className="stat-icon text-danger mb-2">
                           <i className="fas fa-times-circle fa-2x"></i>
                         </div>
                         <span className="h3 mb-0 text-danger font-weight-bold">{stats.notOk}</span>
                         <div className="small text-muted mt-1">Not OK</div>
                         <div className="progress mt-2" style={{height: '4px'}}>
                           <div className="progress-bar bg-danger" style={{width: `${stats.total > 0 ? (stats.notOk / stats.total * 100) : 0}%`}}></div>
                         </div>
                       </div>
                     </div>
                     <div className="col-lg-2 col-md-4 col-sm-6 mb-3">
                       <div className="stat-card p-3 rounded border border-warning" style={cardStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHoverStyle)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}>
                         <div className="stat-icon text-warning mb-2">
                           <i className="fas fa-forward fa-2x"></i>
                         </div>
                         <span className="h3 mb-0 text-warning font-weight-bold">{stats.skipped}</span>
                         <div className="small text-muted mt-1">OK (skipped)</div>
                         <div className="progress mt-2" style={{height: '4px'}}>
                           <div className="progress-bar bg-warning" style={{width: `${stats.total > 0 ? (stats.skipped / stats.total * 100) : 0}%`}}></div>
                         </div>
                       </div>
                     </div>
                     <div className="col-lg-2 col-md-4 col-sm-6 mb-3">
                       <div className="stat-card p-3 rounded border border-secondary" style={cardStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHoverStyle)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}>
                         <div className="stat-icon text-secondary mb-2">
                           <i className="fas fa-question-circle fa-2x"></i>
                         </div>
                         <span className="h3 mb-0 text-secondary font-weight-bold">{stats.na}</span>
                          <div className="small text-muted mt-1">Unknown</div>
                          <div className="progress mt-2" style={{height: '4px'}}>
                            <div className="progress-bar bg-secondary" style={{width: `${stats.total > 0 ? (stats.na / stats.total * 100) : 0}%`}}></div>
                         </div>
                       </div>
                     </div>
                     <div className="col-lg-2 col-md-4 col-sm-6 mb-3">
                       <div className="stat-card p-3 rounded border border-info" style={cardStyle}
                            onMouseEnter={(e) => Object.assign(e.currentTarget.style, cardHoverStyle)}
                            onMouseLeave={(e) => Object.assign(e.currentTarget.style, cardStyle)}>
                         <div className="stat-icon text-info mb-2">
                           <i className="fas fa-server fa-2x"></i>
                         </div>
                         <span className="h3 mb-0 text-info font-weight-bold">{uniqueServers.length}</span>
                         <div className="small text-muted mt-1">Active Servers</div>
                       </div>
                     </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="row mb-4">
            <div className="col-lg-4 col-md-6 mb-3">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-light py-2">
                  <h6 className="mb-0 text-primary">
                    <i className="fas fa-server mr-2"></i>
                    Server Filter
                  </h6>
                </div>
                <div className="card-body p-3">
                  <div className="dropdown">
                    <button 
                      className="btn btn-outline-primary dropdown-toggle w-100 d-flex justify-content-between align-items-center" 
                      type="button" 
                      data-toggle="dropdown"
                      style={{borderRadius: '8px', padding: '10px 15px'}}
                    >
                      <span>
                        <i className="fas fa-filter mr-2"></i>
                        {selectedServers.length === 0 ? 'Select Servers' : 
                         selectedServers.length === uniqueServers.length ? 'All Servers' :
                         `${selectedServers.length} Server${selectedServers.length > 1 ? 's' : ''} Selected`}
                      </span>
                      <i className="fas fa-chevron-down"></i>
                    </button>
                    <div className="dropdown-menu w-100 shadow-lg border-0" style={{ maxHeight: '350px', overflowY: 'auto', borderRadius: '8px' }}>
                      <div className="px-3 py-3 bg-light">
                        <div className="d-flex justify-content-between">
                          <button 
                            className="btn btn-sm btn-success flex-fill mr-2"
                            onClick={() => { setSelectedServers(uniqueServers); setCurrentPage(1); onServerFilterChange?.(uniqueServers); }}
                            style={{borderRadius: '6px'}}
                          >
                            <i className="fas fa-check-double mr-1"></i>
                            Select All
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-danger flex-fill"
                            onClick={() => { setSelectedServers([]); setCurrentPage(1); onServerFilterChange?.([]); }}
                            style={{borderRadius: '6px'}}
                          >
                            <i className="fas fa-times mr-1"></i>
                            Clear All
                          </button>
                        </div>
                      </div>
                      <div className="dropdown-divider my-0"></div>
                      <div className="px-2 py-2">
                        {uniqueServers.map(server => (
                          <div key={server} className="dropdown-item-text px-2 py-2 rounded mb-1" 
                               style={{cursor: 'pointer', transition: 'background-color 0.2s'}}
                               onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                               onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                               onClick={() => handleServerSelection(server)}>
                            <div className="d-flex justify-content-between align-items-center">
                              <span>
                                <i className="fas fa-server mr-2 text-muted"></i>
                                <strong>{server}</strong>
                              </span>
                              {selectedServers.includes(server) && (
                                <i className="fas fa-check text-success"></i>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-lg-4 col-md-6 mb-3">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-light py-2">
                  <h6 className="mb-0 text-primary">
                    <i className="fas fa-search mr-2"></i>
                    Search & Filter
                  </h6>
                </div>
                <div className="card-body p-3">
                  <div className="input-group">
                    <div className="input-group-prepend">
                      <span className="input-group-text bg-primary text-white" style={{borderRadius: '8px 0 0 8px'}}>
                        <i className="fas fa-search"></i>
                      </span>
                    </div>
                    <input 
                      type="text" 
                      className="form-control border-left-0" 
                      placeholder="Search commands, servers, output..."
                      value={searchTerm}
                      onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setCurrentPage(1);
                      }}
                      style={{borderRadius: '0 8px 8px 0', fontSize: '14px'}}
                    />
                    {searchTerm && (
                      <div className="input-group-append">
                        <button 
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() => {
                            setSearchTerm('');
                            setCurrentPage(1);
                          }}
                          style={{borderRadius: '0 8px 8px 0'}}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    )}
                  </div>
                  {searchTerm && (
                    <small className="text-muted mt-2 d-block">
                      <i className="fas fa-info-circle mr-1"></i>
                      Found {filteredResults.length} result{filteredResults.length !== 1 ? 's' : ''}
                    </small>
                  )}
                </div>
              </div>
            </div>
            <div className="col-lg-4 col-md-12 mb-3">
              <div className="card border-0 shadow-sm">
                <div className="card-header bg-light py-2">
                  <h6 className="mb-0 text-primary">
                    <i className="fas fa-cogs mr-2"></i>
                    Display Options
                  </h6>
                </div>
                <div className="card-body p-3">
                  <div className="row">
                    <div className="col-md-6 mb-2">
                      <label className="font-weight-bold text-muted small">Items per page</label>
                      <select 
                        className="form-control form-control-sm" 
                        value={itemsPerPage}
                        onChange={(e) => {
                          setItemsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        style={{borderRadius: '6px'}}
                      >
                        <option value={10}>10 items</option>
                        <option value={20}>20 items</option>
                        <option value={50}>50 items</option>
                        <option value={100}>100 items</option>
                      </select>
                    </div>
                    <div className="col-md-6 mb-2">
                      <label className="font-weight-bold text-muted small">Sort by</label>
                      <select 
                        className="form-control form-control-sm" 
                        value={`${sortBy}-${sortOrder}`}
                        onChange={(e) => {
                          const [newSortBy, newSortOrder] = e.target.value.split('-');
                          setSortBy(newSortBy as any);
                          setSortOrder(newSortOrder as any);
                        }}
                        style={{borderRadius: '6px'}}
                      >
                        <option value="server-asc">Server (A to Z)</option>
                        <option value="server-desc">Server (Z to A)</option>
                        <option value="command-asc">Command (A to Z)</option>
                        <option value="command-desc">Command (Z to A)</option>
                        <option value="status-asc">Status: OK First</option>
                        <option value="status-desc">Status: Not OK First</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-2">
                    <small className="text-muted">
                      <i className="fas fa-info-circle mr-1"></i>
                      Showing {Math.min(itemsPerPage, filteredResults.length)} of {filteredResults.length} results
                    </small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Results Table */}
      {selectedServers.length === 0 && results.length > 0 && (
        <div className="card border-0 shadow-sm">
          <div className="card-body text-center py-5">
            <div className="mb-4">
              <i className="fas fa-server fa-4x text-muted mb-3"></i>
              <h5 className="text-muted">No Servers Selected</h5>
              <p className="text-muted mb-4">Please select at least one server from the filter above to view assessment results.</p>
              <button 
                className="btn btn-primary"
                onClick={() => setSelectedServers(uniqueServers)}
              >
                <i className="fas fa-check-double mr-2"></i>
                Select All Servers
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedServers.length > 0 && paginatedResults.length > 0 ? (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-gradient-primary text-white py-3">
            <div className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">
                <i className="fas fa-table mr-2"></i>
                Assessment Results
              </h5>
              <span className="badge badge-light">
                {paginatedResults.length} of {filteredResults.length} results
              </span>
            </div>
          </div>
          <div className="card-body p-0">
            <div className="table-responsive">
              <table className="table table-hover mb-0">
                <thead className="thead-light">
                  <tr>
                    <th style={{ width: '12%', borderTop: 'none' }} className="font-weight-bold text-primary">
                      <i className="fas fa-server mr-1"></i>
                      Server
                    </th>
                    <th style={{ width: '20%', borderTop: 'none' }} className="font-weight-bold text-primary">
                      <i className="fas fa-tag mr-1"></i>
                      Command Name
                    </th>
                    <th style={{ width: '25%', borderTop: 'none' }} className="font-weight-bold text-primary">
                      <i className="fas fa-terminal mr-1"></i>
                      Command
                    </th>
                    <th style={{ width: '10%', borderTop: 'none' }} className="font-weight-bold text-primary">
                      <i className="fas fa-check-circle mr-1"></i>
                      Status
                    </th>
                    <th style={{ width: '18%', borderTop: 'none' }} className="font-weight-bold text-primary">
                      <i className="fas fa-file-alt mr-1"></i>
                      Output
                    </th>
                    <th style={{ width: '12%', borderTop: 'none' }} className="font-weight-bold text-primary">
                      <i className="fas fa-bullseye mr-1"></i>
                      Reference
                    </th>
                    <th style={{ width: '3%', borderTop: 'none' }} className="text-center">
                      <i className="fas fa-expand-alt"></i>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResults.map((result, index) => {
                    const globalIndex = startIndex + index;
                     const isExpanded = expandedRows.has(globalIndex);
                     const status = getResultStatus(result);
                     const rowClass = status === 'ok' ? 'table-success' : 
                                    status === 'not_ok' ? 'table-danger' : 
                                    status === 'skipped' ? 'table-warning' : '';
                    
                    return (
                      <React.Fragment key={globalIndex}>
                        <tr className={`${rowClass} border-left-0 border-right-0`} style={{
                          transition: 'all 0.2s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}>
                          <td className="align-middle py-3" style={{ borderLeft: `4px solid ${status === 'ok' ? '#28a745' : status === 'not_ok' ? '#dc3545' : status === 'skipped' ? '#ffc107' : '#6c757d'}` }}>
                            <div className="d-flex align-items-center">
                              <div className="server-icon mr-3">
                                <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px' }}>
                                  <i className="fas fa-server text-white" style={{ fontSize: '12px' }}></i>
                                </div>
                              </div>
                              <div>
                                <div className="font-weight-bold text-dark" style={{ whiteSpace: 'pre-line' }}>{result.server_ip}</div>
                                {result.command_id_ref && (
                                  <small className="text-muted">ID: {result.command_id_ref}</small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="align-middle py-3">
                            <div className="command-name-cell">
                              <div className="font-weight-bold text-primary" style={{ fontSize: '13px', wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                <i className="fas fa-tag mr-2 text-info"></i>
                                <span style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                  {result.title || result.command_name || 'Unnamed Command'}
                                </span>
                              </div>
                              {result.skip_reason && (
                                <small className="text-warning d-block mt-1">
                                  <i className="fas fa-info-circle mr-1"></i>
                                  Skip condition detected
                                </small>
                              )}
                            </div>
                          </td>
                          <td className="align-middle py-3">
                            <div className="command-cell">
                              <code className="text-dark bg-light p-2 rounded d-block border" 
                                    style={{ fontSize: '11px', lineHeight: '1.3', wordWrap: 'break-word', whiteSpace: 'pre-wrap' }}>
                                {result.command_text || 'N/A'}
                              </code>
                            </div>
                          </td>
                          <td className="align-middle py-3">
                            <div className="d-flex align-items-center">
                              {getStatusBadge(result)}
                              {status === 'not_ok' && result.recommendations && result.recommendations.length > 0 && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-info ml-2"
                                  onClick={() => handleShowRecommendations(result)}
                                  title="Xem gợi ý khắc phục"
                                >
                                  <i className="fas fa-lightbulb"></i>
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="align-middle py-3">
                            <div className="output-cell">
                              <div style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                {result.status === 'SKIPPED' ? (
                                  <span className="text-warning font-italic">Skipped</span>
                                ) : (result.output || result.actual_output) ? (
                                  <span className={`${status === 'ok' ? 'text-success' : status === 'not_ok' ? 'text-danger' : 'text-muted'}`} style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                    {result.output || result.actual_output}
                                  </span>
                                ) : (
                                  <span className="badge badge-secondary">""</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="align-middle py-3">
                            <div className="reference-cell">
                              <div style={{ wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                {result.reference_value || result.expected_output ? (
                                  <span className="badge badge-info" style={{ wordWrap: 'break-word', whiteSpace: 'normal', maxWidth: 'none' }}>
                                    {result.reference_value || result.expected_output}
                                  </span>
                                ) : (
                                  <span className="badge badge-secondary">""</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="align-middle text-center py-3">
                            <button 
                              className="btn btn-sm btn-outline-primary rounded-circle"
                              onClick={() => toggleRowExpansion(globalIndex)}
                              title={isExpanded ? 'Collapse details' : 'Expand details'}
                              style={{
                                width: '32px',
                                height: '32px',
                                transition: 'all 0.2s ease'
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.1)';
                                e.currentTarget.style.backgroundColor = '#007bff';
                                e.currentTarget.style.color = 'white';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = '#007bff';
                              }}
                            >
                              <i className={`fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
                            </button>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="table-light">
                            <td colSpan={7} className="p-0 border-0">
                              <div className="bg-gradient-light border-top" style={{ borderLeft: `4px solid ${status === 'ok' ? '#28a745' : status === 'not_ok' ? '#dc3545' : status === 'skipped' ? '#ffc107' : '#6c757d'}` }}>
                                <div className="p-4">
                                  <div className="row">
                                    <div className="col-lg-4 mb-4">
                                      <div className="card border-0 shadow-sm h-100">
                                        <div className="card-header bg-primary text-white py-2">
                                          <h6 className="mb-0">
                                            <i className="fas fa-terminal mr-2"></i>
                                            Command Output
                                          </h6>
                                        </div>
                                        <div className="card-body p-3">
                                          <pre className="bg-dark text-light p-3 rounded mb-0" style={{ 
                                            fontSize: '11px', 
                                            maxHeight: '200px', 
                                            overflow: 'auto',
                                            lineHeight: '1.4',
                                            fontFamily: 'Monaco, Consolas, monospace'
                                          }}>
                                            {result.output || result.actual_output || '""'}
                                          </pre>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="col-lg-4 mb-4">
                                      <div className="card border-0 shadow-sm h-100">
                                        <div className="card-header bg-info text-white py-2">
                                          <h6 className="mb-0">
                                            <i className="fas fa-bullseye mr-2"></i>
                                            Expected Value
                                          </h6>
                                        </div>
                                        <div className="card-body p-3">
                                          <div className="bg-light p-3 rounded border" style={{ fontSize: '12px', minHeight: '60px' }}>
                                            {result.reference_value || result.expected_output ? (
                                              <div>
                                                <span className="badge badge-info mb-2">Reference</span>
                                                <div className="text-dark">{result.reference_value || result.expected_output}</div>
                                              </div>
                                            ) : (
                                              <div className="d-flex align-items-center justify-content-center h-100">
                                                <div className="text-center">
                                                  <span className="badge badge-secondary">""</span>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="col-lg-4 mb-4">
                                      <div className="card border-0 shadow-sm h-100">
                                        <div className="card-header bg-secondary text-white py-2">
                                          <h6 className="mb-0">
                                            <i className="fas fa-info-circle mr-2"></i>
                                            Assessment Details
                                          </h6>
                                        </div>
                                        <div className="card-body p-3">
                                          <div className="assessment-details">
                                            {result.skip_reason && (
                                              <div className="mb-3 p-2 bg-warning bg-opacity-10 border-left border-warning rounded">
                                                <div className="d-flex align-items-start">
                                                  <i className="fas fa-exclamation-triangle text-warning mr-2 mt-1"></i>
                                                  <div>
                                                    <strong className="text-warning d-block">Skip Condition</strong>
                                                    <small className="text-dark">{result.skip_reason}</small>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                            {result.validation_result && (
                                              <div className="mb-3 p-2 bg-info bg-opacity-10 border-left border-info rounded">
                                                <div className="d-flex align-items-start">
                                                  <i className="fas fa-check-circle text-info mr-2 mt-1"></i>
                                                  <div>
                                                    <strong className="text-info d-block">Validation Result</strong>
                                                    <small className="text-dark">{result.validation_result}</small>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                            {result.decision && (
                                              <div className="mb-3 p-2 bg-primary bg-opacity-10 border-left border-primary rounded">
                                                <div className="d-flex align-items-start">
                                                  <i className="fas fa-gavel text-primary mr-2 mt-1"></i>
                                                  <div>
                                                    <strong className="text-primary d-block">Final Decision</strong>
                                                    <small className="text-dark">{result.decision}</small>
                                                  </div>
                                                </div>
                                              </div>
                                            )}
                                            {result.consolidated_results && result.consolidated_results.length > 0 && (
                                              <div className="mb-3">
                                                <h6 className="text-dark mb-2">
                                                  <i className="fas fa-list mr-2"></i>
                                                  Detailed Results by Server
                                                </h6>
                                                <div className="table-responsive">
                                                  <table className="table table-sm table-bordered mb-0">
                                                    <thead className="thead-light">
                                                      <tr>
                                                        <th style={{width:'25%'}}>Server</th>
                                                        <th style={{width:'20%'}}>Variables</th>
                                                        <th style={{width:'15%'}}>Status</th>
                                                        <th style={{width:'40%'}}>Output</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {result.consolidated_results.map((detail, i) => {
                                                        const status = detail.status.toLowerCase();
                                                        const badgeClass = status === 'ok' ? 'badge-success' : status === 'skipped' ? 'badge-warning' : 'badge-danger';
                                                        return (
                                                          <tr key={i}>
                                                            <td style={{wordWrap:'break-word', whiteSpace:'normal'}}>
                                                              <code style={{fontSize:'11px'}}>{detail.server_ip}</code>
                                                            </td>
                                                            <td style={{wordWrap:'break-word', whiteSpace:'normal'}}>
                                                              {detail.variables ? (
                                                                <code style={{fontSize:'10px'}}>{detail.variables}</code>
                                                              ) : (
                                                                <span className="text-muted">-</span>
                                                              )}
                                                            </td>
                                                            <td>
                                                              <span className={`badge ${badgeClass}`}>{detail.status}</span>
                                                            </td>
                                                            <td style={{wordWrap:'break-word', whiteSpace:'normal'}}>
                                                              <code style={{fontSize:'10px'}}>{detail.output || ''}</code>
                                                            </td>
                                                          </tr>
                                                        );
                                                      })}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            )}
                                            {!result.skip_reason && !result.validation_result && !result.decision && (!result.consolidated_results || result.consolidated_results.length === 0) && (
                                              <div className="text-muted font-italic text-center py-4">
                                                <i className="fas fa-info-circle fa-2x mb-2"></i>
                                                <div>No additional assessment details available</div>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="card-footer bg-light">
              <div className="d-flex flex-column flex-lg-row justify-content-between align-items-center">
                <div className="d-flex align-items-center mb-3 mb-lg-0">
                  <div className="text-muted mr-4">
                    <i className="fas fa-info-circle mr-2"></i>
                    Showing <strong>{startIndex + 1}</strong> to <strong>{Math.min(startIndex + itemsPerPage, filteredResults.length)}</strong> of <strong>{filteredResults.length}</strong> results
                  </div>
                  <div className="d-flex align-items-center">
                    <label className="text-muted mr-2 mb-0">
                      <i className="fas fa-list mr-1"></i>
                      Items per page:
                    </label>
                    <select 
                      className="form-control form-control-sm" 
                      style={{ width: '80px' }}
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>
                <nav>
                  <ul className="pagination pagination-sm mb-0">
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                      <button 
                        className="page-link border-0 bg-transparent text-primary" 
                        onClick={() => setCurrentPage(1)}
                        disabled={currentPage === 1}
                        style={{ transition: 'all 0.2s ease' }}
                        title="First page"
                      >
                        <i className="fas fa-angle-double-left"></i>
                      </button>
                    </li>
                    <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                      <button 
                        className="page-link border-0 bg-transparent text-primary" 
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        style={{ transition: 'all 0.2s ease' }}
                        title="Previous page"
                      >
                        <i className="fas fa-angle-left"></i>
                      </button>
                    </li>
                    {[...Array(totalPages)].map((_, i) => {
                      const pageNum = i + 1;
                      const showPage = 
                        pageNum === 1 || 
                        pageNum === totalPages || 
                        (pageNum >= currentPage - 2 && pageNum <= currentPage + 2);
                      
                      if (!showPage) {
                        if (pageNum === currentPage - 3 || pageNum === currentPage + 3) {
                          return <li key={pageNum} className="page-item disabled"><span className="page-link border-0 bg-transparent">...</span></li>;
                        }
                        return null;
                      }
                      
                      return (
                        <li key={pageNum} className={`page-item ${currentPage === pageNum ? 'active' : ''}`}>
                          <button 
                            className={`page-link ${currentPage === pageNum ? 'bg-primary border-primary text-white' : 'border-0 bg-transparent text-primary'}`}
                            onClick={() => setCurrentPage(pageNum)}
                            style={{ 
                              transition: 'all 0.2s ease',
                              minWidth: '40px',
                              fontWeight: currentPage === pageNum ? 'bold' : 'normal'
                            }}
                          >
                            {pageNum}
                          </button>
                        </li>
                      );
                    })}
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                      <button 
                        className="page-link border-0 bg-transparent text-primary" 
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        disabled={currentPage === totalPages}
                        style={{ transition: 'all 0.2s ease' }}
                        title="Next page"
                      >
                        <i className="fas fa-angle-right"></i>
                      </button>
                    </li>
                    <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                      <button 
                        className="page-link border-0 bg-transparent text-primary" 
                        onClick={() => setCurrentPage(totalPages)}
                        disabled={currentPage === totalPages}
                        style={{ transition: 'all 0.2s ease' }}
                        title="Last page"
                      >
                        <i className="fas fa-angle-double-right"></i>
                      </button>
                    </li>
                  </ul>
                </nav>
              </div>
            </div>
          )}
        </div>
      ) : selectedServers.length > 0 ? (
          <div className="alert alert-light text-center">
            <i className="fas fa-search mr-2"></i>
            Không tìm thấy kết quả nào cho các tiêu chí đã chọn.
          </div>
      ) : null}

      {/* Recommendations Modal */}
      {showRecommendationsModal && (
        <div className="modal fade show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <i className="fas fa-lightbulb text-warning mr-2"></i>
                  Gợi ý khắc phục - {selectedCommandTitle}
                </h5>
                <button
                  type="button"
                  className="close"
                  onClick={handleCloseRecommendations}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {selectedRecommendations && selectedRecommendations.length > 0 ? (
                  <div>
                    <div className="alert alert-info">
                      <i className="fas fa-info-circle mr-2"></i>
                      Dưới đây là các gợi ý để khắc phục lệnh không thành công. Hãy thử các lệnh theo thứ tự ưu tiên.
                    </div>
                    
                    {selectedRecommendations?.map((rec, index) => (
                      <div key={index} className="card mb-3">
                        <div className="card-header bg-light">
                          <h6 className="mb-0">
                            <i className="fas fa-cog text-primary mr-2"></i>
                            {index + 1}. {rec.title}
                          </h6>
                        </div>
                        <div className="card-body">
                          <p className="text-muted mb-2">{rec.description}</p>
                          <p className="font-italic text-info mb-3">
                            <i className="fas fa-info-circle mr-1"></i>
                            {rec.explanation}
                          </p>
                          
                          <h6 className="text-secondary mb-2">
                            <i className="fas fa-terminal mr-1"></i>
                            Các lệnh gợi ý:
                          </h6>
                          
                          {rec.commands.map((cmd, cmdIndex) => (
                            <div key={cmdIndex} className="mb-2">
                              <div className="d-flex align-items-center">
                                <code 
                                  className="bg-dark text-light p-2 rounded flex-grow-1"
                                  style={{ fontSize: '12px', cursor: 'pointer' }}
                                  onClick={() => navigator.clipboard.writeText(cmd)}
                                  title="Click để copy"
                                >
                                  {cmd}
                                </code>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary ml-2"
                                  onClick={() => navigator.clipboard.writeText(cmd)}
                                  title="Copy command"
                                >
                                  <i className="fas fa-copy"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    
                    <div className="alert alert-warning">
                      <i className="fas fa-exclamation-triangle mr-2"></i>
                      <strong>Lưu ý:</strong> Hãy kiểm tra và điều chỉnh các lệnh cho phù hợp với môi trường của bạn trước khi thực thi.
                    </div>
                  </div>
                ) : (
                  <div className="alert alert-warning">
                    <i className="fas fa-exclamation-triangle mr-2"></i>
                    Không có gợi ý khắc phục cho lệnh này.
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseRecommendations}
                >
                  <i className="fas fa-times mr-2"></i>
                  Đóng
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AssessmentResultsTable;