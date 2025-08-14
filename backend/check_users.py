from models.user import User
from models import db
from app import app

with app.app_context():
    print('All users:')
    users = User.query.all()
    for user in users:
        print(f'  ID: {user.id}, Username: {user.username}, Role: {user.role}')