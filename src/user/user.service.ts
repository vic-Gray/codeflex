import { BadRequestException, Injectable, UnauthorizedException, NotFoundException, Inject } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { logInDto } from 'src/Dto/logIn.dto';
import { v4 as uuidv4 } from 'uuid';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    @Inject('CLOUDINARY') private readonly cloudinary: any,
  ) {}

  async create({ firstName, password, email, phone, userName, role, lastName }: CreateUserDto) {
    const userEmail = await this.userRepository.findOneBy({ email });
    const userPhone = await this.userRepository.findOneBy({ phone });

    if (userEmail) {
      throw new UnauthorizedException('Sorry, email is already in use');
    }
    if (userPhone) {
      throw new UnauthorizedException('Sorry, phone is already in use');
    }

    const shortUuid = uuidv4().slice(0, 6);
    const displayName = `@${userName}_${shortUuid}`;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = this.userRepository.create({
      firstName,
      email,
      password: hashedPassword,
      phone,
      userName: displayName,
      role,
      lastName,
    });

    await this.userRepository.save(newUser);
    return newUser;
  }

  async login(loginDto: logInDto) {
    const { email, password } = loginDto;
    const user = await this.userRepository.findOneBy({ email });
    if (!user) {
      throw new NotFoundException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      userName: user.userName,
    };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async uploadToCloudinary(file: Express.Multer.File): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: 'profile-pictures' },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      ).end(file.buffer);
    });
  }

  async updateProfilePicture(id: number, profilePictureUrl: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.profilePicture = profilePictureUrl;
    return this.userRepository.save(user);
  }

  async findAll() {
    return await this.userRepository.find();
  }

  async findOne(id: number) {
    if (isNaN(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const oneUser = await this.userRepository.findOneBy({ id });

    if (!oneUser) {
      throw new NotFoundException('User not found');
    }

    return oneUser;
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    if (isNaN(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const existingUser = await this.userRepository.findOneBy({ id });
    if (!existingUser) {
      throw new NotFoundException(`User with ID #${id} not found`);
    }

    const updatedUser = this.userRepository.merge(existingUser, updateUserDto);
    await this.userRepository.save(updatedUser);

    return {
      message: `Dear ${existingUser.firstName}, your profile has been successfully updated.`,
    };
  }

  async remove(id: number) {
    if (isNaN(id)) {
      throw new BadRequestException('Invalid ID format');
    }

    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.delete({ id });

    return {
      message: 'Your account has been deleted successfully',
    };
  }

  async searchUserByName(name: string): Promise<User[]> {
    if (!name || typeof name !== 'string') {
      throw new BadRequestException('Invalid name');
    }

    return this.userRepository
      .createQueryBuilder('user')
      .where('user.userName ILIKE :name', { name: `%${name}%` })
      .getMany();
  }
}
