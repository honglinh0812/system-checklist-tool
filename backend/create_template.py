import pandas as pd
import os

def create_excel_template():
    """Create Excel template file with proper formatting"""
    
    data = {
        'IP': ['127.0.0.1', '192.168.1.100'],
        'admin_username': ['admin', 'admin'],
        'admin_password': ['admin123', 'admin123'],
        'root_username': ['root', 'root'],
        'root_password': ['root123', 'root123']
    }
    
    # Add comments to explain the columns
    comments = {
        'IP': 'IP address của server',
        'admin_username': 'Username để SSH vào server',
        'admin_password': 'Password để SSH vào server', 
        'root_username': 'Username để sudo (thường là root)',
        'root_password': 'Password để sudo'
    }
    
    df = pd.DataFrame(data)
    
    os.makedirs('templates', exist_ok=True)
    
    template_path = 'templates/server_list_template.xlsx'
    with pd.ExcelWriter(template_path, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Server List', index=False)
        
        workbook = writer.book
        worksheet = writer.sheets['Server List']
        
        from openpyxl.styles import Font, PatternFill, Alignment
        
        header_font = Font(bold=True, color="FFFFFF")
        header_fill = PatternFill(start_color="366092", end_color="366092", fill_type="solid")
        
        for cell in worksheet[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")
        
        for column in worksheet.columns:
            max_length = 0
            column_letter = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 30)
            worksheet.column_dimensions[column_letter].width = adjusted_width
    
    print(f"Excel template created: {template_path}")

if __name__ == "__main__":
    create_excel_template() 