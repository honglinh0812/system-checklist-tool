import React, { useState } from 'react';
import { Command, CommandTemplate } from '../types';
import { API_BASE_URL } from '../config';

interface CommandBuilderProps {
  commands: Command[];
  commandTemplates: CommandTemplate[];
  onCommandsChange: (commands: Command[]) => void;
}

const CommandBuilder: React.FC<CommandBuilderProps> = ({
  commands,
  commandTemplates,
  onCommandsChange
}) => {
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [validationResults, setValidationResults] = useState<{[key: string]: any}>({});

  const addCommand = () => {
    const newCommand: Command = {
      id: `cmd_${Date.now()}`,
      title: '',
      command: ''
    };
    onCommandsChange([...commands, newCommand]);
  };

  const removeCommand = (id: string) => {
    onCommandsChange(commands.filter(cmd => cmd.id !== id));
    // Remove validation result
    const newValidationResults = { ...validationResults };
    delete newValidationResults[id];
    setValidationResults(newValidationResults);
  };

  const updateCommand = (id: string, field: 'title' | 'command', value: string) => {
    const updatedCommands = commands.map(cmd => 
      cmd.id === id ? { ...cmd, [field]: value } : cmd
    );
    onCommandsChange(updatedCommands);
  };

  const validateCommand = async (command: string, id: string) => {
    if (!command.trim()) {
      setValidationResults(prev => ({
        ...prev,
        [id]: { valid: false, errors: ['Lệnh không được để trống'] }
      }));
      return;
    }

    // Check for pipeline operators (only | is allowed)
    if (command.includes('&&') || command.includes('||') || command.includes(';')) {
      setValidationResults(prev => ({
        ...prev,
        [id]: { valid: false, errors: ['Chỉ cho phép sử dụng pipeline operator (|), không cho phép &&, ||, ;'] }
      }));
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/commands/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
      });

      const result = await response.json();
      setValidationResults(prev => ({
        ...prev,
        [id]: result
      }));
    } catch (error) {
      setValidationResults(prev => ({
        ...prev,
        [id]: { valid: false, errors: ['Lỗi khi validate lệnh'] }
      }));
    }
  };

  const selectTemplate = (template: CommandTemplate) => {
    const newCommand: Command = {
      id: `cmd_${Date.now()}`,
      title: template.title,
      command: template.command
    };
    onCommandsChange([...commands, newCommand]);
    setShowTemplateModal(false);
  };

  const getValidationStatus = (id: string) => {
    const result = validationResults[id];
    if (!result) return 'idle';
    return result.valid ? 'valid' : 'invalid';
  };

  return (
    <div className="command-builder">
      <div className="command-builder-header">
        <h3>Danh sách lệnh ({commands.length})</h3>
        <div className="command-actions">
          <button 
            className="btn btn-secondary"
            onClick={() => setShowTemplateModal(true)}
          >
            📋 Chọn từ template
          </button>
                      <button 
              className="btn btn-primary"
              onClick={addCommand}
            >
              ➕ Thêm lệnh
            </button>
        </div>
      </div>

      <div className="commands-list">
        {commands.map((command, index) => (
          <div key={command.id} className="command-item">
            <div className="command-header">
              <span className="command-number">Lệnh {index + 1}</span>
              <button 
                className="btn btn-danger btn-small"
                onClick={() => removeCommand(command.id)}
              >
                🗑️
              </button>
            </div>

            <div className="command-fields">
              <div className="field-group">
                <label>Tiêu đề lệnh:</label>
                <input
                  type="text"
                  value={command.title}
                  onChange={(e) => updateCommand(command.id, 'title', e.target.value)}
                  placeholder="VD: SSH1 - Kiểm tra disable root SSH login"
                  className="input-field"
                />
              </div>

              <div className="field-group">
                <label>Câu lệnh shell:</label>
                <div className="command-input-group">
                  <textarea
                    value={command.command}
                    onChange={(e) => updateCommand(command.id, 'command', e.target.value)}
                    onBlur={() => validateCommand(command.command, command.id)}
                    placeholder="VD: grep -i '^PermitRootLogin' /etc/ssh/sshd_config | awk '{print $2}'"
                    className={`input-field command-input ${getValidationStatus(command.id)}`}
                    rows={3}
                  />
                  <div className="validation-status">
                    {getValidationStatus(command.id) === 'valid' && (
                      <span className="icon valid">✅</span>
                    )}
                    {getValidationStatus(command.id) === 'invalid' && (
                      <span className="icon invalid">❌</span>
                    )}
                  </div>
                </div>
                
                {/* Validation errors */}
                {validationResults[command.id] && !validationResults[command.id].valid && (
                  <div className="validation-errors">
                    {validationResults[command.id].errors.map((error: string, i: number) => (
                      <div key={i} className="error-message">
                        ❌ {error}
                      </div>
                    ))}
                    {validationResults[command.id].warnings?.map((warning: string, i: number) => (
                      <div key={i} className="warning-message">
                        ⚠️ {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        {commands.length === 0 && (
          <div className="no-commands">
            <p>Chưa có lệnh nào. Hãy thêm lệnh hoặc chọn từ template.</p>
          </div>
        )}
      </div>

      {/* Template Modal */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Chọn từ template</h3>
              <button 
                className="modal-close"
                onClick={() => setShowTemplateModal(false)}
              >
                ✕
              </button>
            </div>
            
            <div className="template-list">
              {commandTemplates.map((template) => (
                <div 
                  key={template.id}
                  className="template-item"
                  onClick={() => selectTemplate(template)}
                >
                  <h4>{template.title}</h4>
                  <code>{template.command}</code>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CommandBuilder; 