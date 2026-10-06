import UserProfileImage from '../../assets/user.png';
import RobotProfileImage from '../../assets/robot.png';
import './Avatar.css';

/**
 * Sender avatar.
 *
 * Uses the existing project artwork. `alt` is empty rather than a description
 * because the sender is already announced by the message itself; a redundant
 * "robot" on every reply is noise for a screen reader.
 */
export function Avatar({ sender, size = 'md' }) {
  const isUser = sender === 'user';

  return (
    <img
      className={`avatar avatar--${size}`}
      src={isUser ? UserProfileImage : RobotProfileImage}
      alt=""
      width={size === 'sm' ? 24 : 30}
      height={size === 'sm' ? 24 : 30}
      draggable="false"
    />
  );
}

export default Avatar;