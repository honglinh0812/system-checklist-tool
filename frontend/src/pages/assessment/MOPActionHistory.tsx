import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { apiService } from '../../services/api';
import { USER_ROLES } from '../../utils/constants';
import { usePersistedState } from '../../hooks/usePersistedState';
import { useTranslation } from '../../i18n/useTranslation'

interface MOPAction {
  id: number;
  action_type: string;
  action_time: string;
  action_time_formatted: string;
  mop_id: number;
  mop_name: string;
  user_name: string;
  user_id: number;
  details?: string;
  old_status?: string;
  new_status?: string;
  reason?: string;
}

const MOPActionHistory: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  
  const [actions, setActions] = usePersistedState<MOPAction[]>('mop_action_history', [], { autoSave: true, autoSaveInterval: 30000 });
  const [selectedAction, setSelectedAction] = usePersistedState<MOPAction | null>('mop_action_selectedAction', null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.role === USER_ROLES.ADMIN;
  const isUser = user?.role === USER_ROLES.USER;
  const isViewer = user?.role === USER_ROLES.VIEWER;
  const canExport = isAdmin || isUser;

  useEffect(() => {
    fetchActions();
  }, []);

  const fetchActions = async () => {
    try {
      const data = await apiService.get<any>('/api/audit/mop-actions');
      if (data.success) {
        setActions(data.data.actions || []);
      }
    } catch (error) {
      console.error('Error fetching MOP actions:', error);
    } finally {
      setLoading(false);
    }
  };

  const viewAction = (action: MOPAction) => {
    setSelectedAction(action);
    setShowDetailModal(true);
  };

  const handleExportAll = async () => {
    try {
      // Escape CSV values to handle commas and quotes
      const escapeCSV = (value: any) => {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };
      
      const csvContent = [
        [t('actionId'), t('actionType'), t('actionTime'), t('mopName'), t('user'), t('oldStatus'), t('newStatus'), t('details')].map(escapeCSV).join(','),
        ...actions.map(action => [
          action.id,
          action.action_type,
          action.action_time_formatted,
          action.mop_name,
          action.user_name,
          action.old_status || '',
          action.new_status || '',
          action.details || ''
        ].map(escapeCSV).join(','))
      ].join('\n');
      
      // Add UTF-8 BOM for proper Vietnamese character display
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `mop_action_history_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting MOP actions:', error);
    }
  };

  const getActionBadge = (actionType: string) => {
    switch (actionType?.toLowerCase()) {
      case 'created':
        return <span className="badge badge-primary"><i className="fas fa-plus mr-1"></i>{t('created')}</span>;
      case 'approved':
        return <span className="badge badge-success"><i className="fas fa-check mr-1"></i>{t('approved')}</span>;
      case 'rejected':
        return <span className="badge badge-danger"><i className="fas fa-times mr-1"></i>{t('rejected')}</span>;
      case 'deleted':
        return <span className="badge badge-dark"><i className="fas fa-trash mr-1"></i>{t('deleted')}</span>;
      case 'updated':
        return <span className="badge badge-warning"><i className="fas fa-edit mr-1"></i>{t('updated')}</span>;
      default:
        return <span className="badge badge-secondary">{actionType || t('unknown')}</span>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return <span className="badge badge-success">{t('approved')}</span>;
      case 'pending':
        return <span className="badge badge-warning">{t('pending')}</span>;
      case 'rejected':
        return <span className="badge badge-danger">{t('rejected')}</span>;
      case 'deleted':
        return <span className="badge badge-dark">{t('deleted')}</span>;
      default:
        return status ? <span className="badge badge-secondary">{t('pending')}</span> : null;
    }
  };

  const getPageTitle = () => {
    if (isViewer) {
      return t('mopActionHistoryViewOnly');
    }
    return t('mopActionHistory');
  };

  const getPageDescription = () => {
    if (isViewer) {
      return t('mopActionHistoryDescriptionViewOnly');
    }
    return t('mopActionHistoryDescription');
  };

  return (
    <div className="content-wrapper">
      <div className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1 className="m-0">{getPageTitle()}</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item"><a href="#">{t('home')}</a></li>
                <li className="breadcrumb-item">{t('executionHistory')}</li>
                <li className="breadcrumb-item active">{t('mopActions')}</li>
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-clipboard-list mr-2"></i>
                    {getPageDescription()}
                  </h3>
                  {canExport && (
                    <div className="float-right">
                      <button 
                        type="button" 
                        className="btn btn-success"
                        onClick={handleExportAll}
                      >
                        <i className="fas fa-download mr-2"></i>
                        {t('exportAll')}
                      </button>
                    </div>
                  )}
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-4">
                      <i className="fas fa-spinner fa-spin fa-2x text-muted"></i>
                      <p className="mt-2 text-muted">{t('loadingMopActionHistory')}</p>
                    </div>
                  ) : actions.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped">
                        <thead>
                          <tr>
                            <th>{t('time')}</th>
                            <th>{t('actionType')}</th>
                            <th>{t('mop')}</th>
                            <th>{t('performer')}</th>
                            <th>{t('status')}</th>
                            <th>{t('actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {actions.map(action => (
                            <tr key={action.id}>
                              <td>
                                <div>
                                  <strong>{action.action_time_formatted || new Date(action.action_time).toLocaleString()}</strong>
                                </div>
                              </td>
                              <td>{getActionBadge(action.action_type)}</td>
                              <td>
                                <strong>{action.mop_name}</strong>
                                <div>
                                  <small className="text-muted">
                                    ID: {action.mop_id}
                                  </small>
                                </div>
                              </td>
                              <td>
                                <i className="fas fa-user mr-1"></i>
                                {action.user_name}
                              </td>
                              <td>
                                <div>
                                  {action.old_status && (
                                    <div>
                                      <small className="text-muted">{t('from')}: </small>
                                      {getStatusBadge(action.old_status)}
                                    </div>
                                  )}
                                  {action.new_status && (
                                    <div>
                                      <small className="text-muted">{t('to')}: </small>
                                      {getStatusBadge(action.new_status)}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className="btn-group" role="group">
                                  <button 
                                    type="button" 
                                    className="btn btn-sm btn-info"
                                    onClick={() => viewAction(action)}
                                    title={t('viewDetails')}
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <i className="fas fa-inbox fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">{t('noMopActionHistoryFound')}</h5>
                      <p className="text-muted">{t('noMopActionsRecorded')}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {showDetailModal && selectedAction && (
        <div className="modal fade show" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h4 className="modal-title">
                  <i className="fas fa-info-circle mr-2"></i>
                  {t('mopActionDetails')}
                </h4>
                <button 
                  type="button" 
                  className="close" 
                  onClick={() => setShowDetailModal(false)}
                >
                  <span>&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6">
                    <h5>{t('basicInformation')}</h5>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>{t('actionId')}:</strong></td>
                          <td>{selectedAction.id}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('actionType')}:</strong></td>
                          <td>{getActionBadge(selectedAction.action_type)}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('mopName')}:</strong></td>
                          <td>{selectedAction.mop_name}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('mopId')}:</strong></td>
                          <td>{selectedAction.mop_id}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('performedBy')}:</strong></td>
                          <td>{selectedAction.user_name}</td>
                        </tr>
                        <tr>
                          <td><strong>{t('actionTime')}:</strong></td>
                          <td>{selectedAction.action_time_formatted || new Date(selectedAction.action_time).toLocaleString()}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="col-md-6">
                    <h5>{t('statusChanges')}</h5>
                    <div className="mb-3">
                      {selectedAction.old_status && (
                        <div className="mb-2">
                          <span className="text-muted">{t('previousStatus')}: </span>
                          {getStatusBadge(selectedAction.old_status)}
                        </div>
                      )}
                      {selectedAction.new_status && (
                        <div className="mb-2">
                          <span className="text-muted">{t('newStatus')}: </span>
                          {getStatusBadge(selectedAction.new_status)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {selectedAction.details && (
                  <div className="row">
                    <div className="col-md-12">
                      <h5>{t('details')}</h5>
                      <div className="bg-light p-3 rounded">
                        {selectedAction.details}
                      </div>
                    </div>
                  </div>
                )}

                {selectedAction.reason && (
                  <div className="row mt-3">
                    <div className="col-md-12">
                      <h5>{t('reason')}</h5>
                      <div className="bg-light p-3 rounded">
                        {selectedAction.reason}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowDetailModal(false)}
                >
                  {t('close')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MOPActionHistory;