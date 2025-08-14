import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import { API_ENDPOINTS } from '../../utils/constants';

interface Execution {
  id: number;
  execution_time: string;
  execution_time_formatted: string;
  risk_assessment: boolean;
  handover_assessment: boolean;
  mop_name: string;
  status: string;
  user_name: string;
  assessment_type?: string;
  success_rate: number;
  total_commands: number;
  passed_commands: number;
  failed_commands: number;
  server_count: number;
  duration?: number;
  type: string;
  details?: string;
}

const ExecutionHistory: React.FC = () => {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExecutions();
  }, []);

  const fetchExecutions = async () => {
    try {
      const data = await apiService.get<any>(API_ENDPOINTS.EXECUTIONS.HISTORY);
      if (data.success) {
        setExecutions(data.data.executions || []);
      }
    } catch (error) {
      console.error('Error fetching executions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAssessmentBadges = (execution: Execution) => {
    const badges = [];
    if (execution.risk_assessment) {
      badges.push(
        <span key="risk" className="badge badge-warning mr-1">
          Đánh giá rủi ro
        </span>
      );
    }
    if (execution.handover_assessment) {
      badges.push(
        <span key="handover" className="badge badge-info">
          Đánh giá bàn giao
        </span>
      );
    }
    return badges;
  };

  const getResultBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed':
        return <span className="badge badge-success">Thành công</span>;
      case 'failed':
        return <span className="badge badge-danger">Thất bại</span>;
      case 'running':
        return <span className="badge badge-warning">Đang chạy</span>;
      case 'pending':
        return <span className="badge badge-info">Chờ xử lý</span>;
      default:
        return <span className="badge badge-secondary">Không xác định</span>;
    }
  };

  const handleExportAll = () => {
    // Logic để export tất cả kết quả
    console.log('Exporting all results...');
  };

  const handleViewDetails = (executionId: number) => {
    // Logic để xem chi tiết execution
    console.log('Viewing details for execution:', executionId);
  };

  const handleExportSingle = (executionId: number) => {
    // Logic để export một execution
    console.log('Exporting execution:', executionId);
  };

  return (
    <div>
      {/* Content Header */}
      <section className="content-header">
        <div className="container-fluid">
          <div className="row mb-2">
            <div className="col-sm-6">
              <h1>Execution History</h1>
            </div>
            <div className="col-sm-6">
              <ol className="breadcrumb float-sm-right">
                <li className="breadcrumb-item">
                  <Link to="/dashboard">Home</Link>
                </li>
                <li className="breadcrumb-item active">Execution History</li>
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <section className="content">
        <div className="container-fluid">
          <div className="row">
            <div className="col-12">
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <i className="fas fa-history mr-2"></i>
                    Execution History (Last 7 Days)
                  </h3>
                  <div className="card-tools">
                    <button 
                      type="button" 
                      className="btn btn-success"
                      onClick={handleExportAll}
                    >
                      <i className="fas fa-download mr-2"></i>
                      Export All
                    </button>
                  </div>
                </div>
                <div className="card-body">
                  {loading ? (
                    <div className="text-center py-4">
                      <i className="fas fa-spinner fa-spin fa-2x text-muted"></i>
                      <p className="mt-2 text-muted">Loading execution history...</p>
                    </div>
                  ) : executions.length > 0 ? (
                    <div className="table-responsive">
                      <table className="table table-striped">
                        <thead>
                          <tr>
                            <th>Thời gian chạy</th>
                            <th>Loại đánh giá</th>
                            <th>MOP được sử dụng</th>
                            <th>Kết quả đánh giá</th>
                            <th>Người thực thi</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {executions.map(execution => (
                            <tr key={execution.id}>
                              <td>
                                <strong>{execution.execution_time_formatted}</strong>
                              </td>
                              <td>
                                {getAssessmentBadges(execution)}
                              </td>
                              <td>
                                <span className="text-primary font-weight-bold">
                                  {execution.mop_name}
                                </span>
                              </td>
                              <td>
                                {getResultBadge(execution.status)}
                              </td>
                              <td>
                                <i className="fas fa-user mr-1"></i>
                                {execution.user_name}
                              </td>
                              <td>
                                <div className="btn-group" role="group">
                                  <button 
                                    className="btn btn-sm btn-info"
                                    onClick={() => handleViewDetails(execution.id)}
                                    title="View Details"
                                  >
                                    <i className="fas fa-eye"></i>
                                  </button>
                                  <button 
                                    className="btn btn-sm btn-success"
                                    onClick={() => handleExportSingle(execution.id)}
                                    title="Export"
                                  >
                                    <i className="fas fa-download"></i>
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
                      <i className="fas fa-info-circle fa-3x text-muted mb-3"></i>
                      <h5 className="text-muted">No Execution History</h5>
                      <p className="text-muted">
                        No executions have been performed in the last 7 days.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default ExecutionHistory;